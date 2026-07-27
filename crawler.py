#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""985高校及中科院/国科大研究单位理论物理、天文学保研通知抓取器。

设计原则：
1. 仅将学校/学院官方域名作为最终可信来源；
2. 搜索API只负责发现候选链接，不直接判定通知为真；
3. 截止时间等字段均标记为自动抽取，保留人工复核状态；
4. 失败时保留旧数据，不清空历史结果。
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlsplit, urlunsplit, urldefrag

import requests
import yaml
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CONFIG_PATH = ROOT / "config.yaml"
JSON_PATH = DATA_DIR / "notices.json"
JS_PATH = DATA_DIR / "notices.js"
REPORT_PATH = DATA_DIR / "crawl_report.json"

DATE_PATTERNS = [
    re.compile(r"(?P<y>20\d{2})[年\-/\.](?P<m>\d{1,2})[月\-/\.](?P<d>\d{1,2})日?"),
    re.compile(r"(?P<m>\d{1,2})月(?P<d>\d{1,2})日"),
]
DEADLINE_CONTEXT = re.compile(r"(?:报名|申请|提交|材料|系统)?\s*(?:截止|截至|截止时间|报名时间)[：:\s]{0,5}(.{0,80})", re.I)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")


def load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def make_session(user_agent: str) -> requests.Session:
    s = requests.Session()
    retries = Retry(total=2, connect=2, read=2, backoff_factor=0.6,
                    status_forcelist=(429, 500, 502, 503, 504), allowed_methods=("GET", "POST"))
    s.mount("http://", HTTPAdapter(max_retries=retries))
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.headers.update({"User-Agent": user_agent, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6"})
    return s


def canonical_url(url: str) -> str:
    url = urldefrag(url)[0].strip()
    p = urlsplit(url)
    if not p.scheme or not p.netloc:
        return ""
    path = re.sub(r"/{2,}", "/", p.path or "/")
    query = "&".join(x for x in p.query.split("&") if x and not x.lower().startswith(("utm_", "spm=")))
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), path, query, ""))


def allowed_domain(url: str, domains: list[str]) -> bool:
    host = urlsplit(url).netloc.lower().split(":")[0]
    return any(host == d.lower() or host.endswith("." + d.lower()) for d in domains if d)


def fetch(session: requests.Session, url: str, timeout: int) -> tuple[str, str]:
    r = session.get(url, timeout=timeout, allow_redirects=True)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "").lower()
    if not any(x in ctype for x in ("text/html", "application/xhtml", "text/xml", "application/xml", "text/plain")):
        return r.url, ""
    if not r.encoding or r.encoding.lower() == "iso-8859-1":
        r.encoding = r.apparent_encoding or "utf-8"
    return r.url, r.text


def clean_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "svg", "canvas"]):
        tag.decompose()
    root = soup.select_one("article, main, .content, .article, .news-content, .v_news_content") or soup.body or soup
    text = root.get_text("\n", strip=True)
    text = re.sub(r"[ \t\u3000]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:30000]


def page_title(soup: BeautifulSoup) -> str:
    for sel in ("h1", ".article-title", ".news-title", "title"):
        n = soup.select_one(sel)
        if n:
            t = n.get_text(" ", strip=True)
            if t:
                return re.sub(r"\s+", " ", t)[:300]
    return ""


def extract_links(html: str, base_url: str, domains: list[str], max_links: int) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = canonical_url(urljoin(base_url, a["href"]))
        if not href or href in seen or not allowed_domain(href, domains):
            continue
        if re.search(r"\.(?:jpg|jpeg|png|gif|zip|rar|7z|docx?|xlsx?|pptx?|mp4|mp3)(?:\?|$)", href, re.I):
            continue
        seen.add(href)
        out.append((href, a.get_text(" ", strip=True)[:200]))
        if len(out) >= max_links:
            break
    return out


def likely_link(text: str, url: str, cfg: dict[str, Any]) -> bool:
    hay = f"{text} {url}".lower()
    route_terms = [x for v in cfg["routes"].values() for x in v]
    major_terms = [x for v in cfg["majors"].values() for x in v.get("exact", []) + v.get("scope", [])]
    year_terms = [str(cfg["target"]["publish_year"]), str(cfg["target"]["admission_year"])]
    return (any(x.lower() in hay for x in route_terms) and
            (any(x.lower() in hay for x in major_terms) or any(k.lower() in hay for k in cfg["keywords"])) and
            (any(y in hay for y in year_terms) or "notice" in hay or "info" in hay or "tzgg" in hay))


def search_web(session: requests.Session, query: str, cfg: dict[str, Any]) -> list[str]:
    """通过 Serper 发现候选页面；未配置密钥时安静退化为官网入口抓取。"""
    provider = os.getenv("SEARCH_PROVIDER", cfg.get("search", {}).get("provider", "serper")).lower()
    count = int(cfg.get("search", {}).get("results_per_query", 10))
    if provider != "serper":
        return []
    key = os.getenv("SERPER_API_KEY")
    if not key:
        return []
    r = session.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": key, "Content-Type": "application/json"},
        json={"q": query, "num": count, "gl": "cn", "hl": "zh-cn"},
        timeout=20,
    )
    r.raise_for_status()
    return [x.get("link", "") for x in r.json().get("organic", [])]


def build_queries(school: dict[str, Any], cfg: dict[str, Any]) -> list[str]:
    """默认每个单位只发1条组合查询，兼顾夏令营和预推免并节省API额度。"""
    pyear, ayear = cfg["target"]["publish_year"], cfg["target"]["admission_year"]
    domain = school.get("official_domains", [""])[0]
    domain_part = f"site:{domain}" if domain else ""
    names = [school["name"], *school.get("aliases", [])]
    name_part = " OR ".join(f'"{n}"' for n in names[:4])
    kw = " OR ".join(["理论物理", "天文学", "天体物理", *cfg["keywords"]])
    route = "夏令营 OR 暑期学校 OR 预推免 OR 推免预报名 OR 接收推荐免试 OR 接收推免"
    return [f'{domain_part} ({name_part}) ({route}) ({kw}) {pyear} {ayear}'.strip()]

def extract_date(text: str, target_year: int | None = None) -> str:
    for pat in DATE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        gd = m.groupdict()
        y = int(gd.get("y") or target_year or dt.date.today().year)
        mo, day = int(gd["m"]), int(gd["d"])
        try:
            return dt.date(y, mo, day).isoformat()
        except ValueError:
            continue
    return ""


def extract_published(soup: BeautifulSoup, text: str, target_year: int) -> str:
    for key in ("article:published_time", "pubdate", "publishdate", "date"):
        n = soup.find("meta", attrs={"property": key}) or soup.find("meta", attrs={"name": key})
        if n and n.get("content"):
            d = extract_date(n["content"], target_year)
            if d: return d
    head = text[:1500]
    return extract_date(head, target_year)


def extract_deadline(text: str, target_year: int) -> tuple[str, str]:
    for m in DEADLINE_CONTEXT.finditer(text[:12000]):
        ctx = m.group(0)
        d = extract_date(ctx, target_year)
        if d:
            return d, re.sub(r"\s+", " ", ctx)[:120]
    return "", ""


def classify(title: str, text: str, school: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any] | None:
    hay = f"{title}\n{text[:18000]}"
    if any(x in hay for x in cfg.get("exclude_keywords", [])):
        return None
    routes=[]
    for name, terms in cfg["routes"].items():
        if any(t in hay for t in terms): routes.append(name)
    if not routes:
        return None
    majors=[]
    for name, rule in cfg["majors"].items():
        exact = any(t in hay for t in rule.get("exact", []))
        scoped = any(t in hay for t in rule.get("scope", [])) and any(k in hay for k in cfg["keywords"])
        if exact or scoped: majors.append(name)
    if not majors:
        return None
    matched=[k for k in cfg["keywords"] if k in hay]
    py, ay = str(cfg["target"]["publish_year"]), str(cfg["target"]["admission_year"])
    score=30
    score += 20 if any(t in title for n in routes for t in cfg["routes"][n]) else 10
    score += 25 if any(t in hay for m in majors for t in cfg["majors"][m].get("exact", [])) else 12
    score += min(20, 5*len(matched))
    score += 10 if py in hay or ay in hay else 0
    names = [school["name"], *school.get("aliases", [])]
    score += 5 if any(n in hay for n in names) else 0
    verification = "高" if score >= 85 else ("中" if score >= 70 else "低")
    return {"route": routes[0], "majors": majors, "matched_keywords": matched, "score": score, "verification": verification}


def process_candidate(session: requests.Session, url: str, school: dict[str, Any], cfg: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    try:
        final, html = fetch(session, url, int(cfg["crawler"]["timeout_seconds"]))
        if not html or not allowed_domain(final, school.get("official_domains", [])):
            return None, None
        soup = BeautifulSoup(html, "html.parser")
        title = page_title(soup)
        text = clean_text(soup)
        c = classify(title, text, school, cfg)
        if not c or c["score"] < int(cfg["crawler"]["min_score"]):
            return None, None
        pub = extract_published(soup, text, int(cfg["target"]["publish_year"]))
        deadline, deadline_context = extract_deadline(text, int(cfg["target"]["publish_year"]))
        status = "待人工确认"
        if deadline:
            try:
                status = "报名中" if dt.date.fromisoformat(deadline) >= dt.date.today() else "已截止"
            except ValueError:
                pass
        uid = hashlib.sha1(canonical_url(final).encode("utf-8")).hexdigest()[:16]
        excerpt = re.sub(r"\s+", " ", text)[:420]
        return ({
            "id": uid, "school": school["name"], "institution_type": school.get("institution_type", "其他"), "region": school.get("region", ""), "college": school.get("college", ""),
            "route": c["route"], "majors": c["majors"], "matched_keywords": c["matched_keywords"],
            "title": title or final, "url": canonical_url(final), "source_url": url,
            "published_at": pub, "deadline": deadline, "deadline_context": deadline_context,
            "status": status, "score": c["score"], "verification": c["verification"],
            "excerpt": excerpt, "first_seen": now_iso(), "last_seen": now_iso(), "origin": "crawler",
        }, None)
    except Exception as e:
        return None, f"{url}: {type(e).__name__}: {e}"


def discover_school(session: requests.Session, school: dict[str, Any], cfg: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    domains = school.get("official_domains", [])
    max_pages = int(cfg["crawler"]["max_pages_per_school"])
    max_links = int(cfg["crawler"]["max_links_per_page"])
    candidates=set(canonical_url(u) for u in school.get("start_urls", []) if canonical_url(u))
    errors=[]
    # Search API discovery (optional)
    for q in build_queries(school, cfg):
        try:
            for u in search_web(session, q, cfg):
                cu=canonical_url(u)
                if cu and allowed_domain(cu, domains): candidates.add(cu)
        except Exception as e:
            errors.append(f"search {school['name']}: {type(e).__name__}: {e}")
    # Crawl seed/list pages one hop and retain likely links.
    seeds=list(candidates)
    for seed in seeds[:12]:
        try:
            final, html = fetch(session, seed, int(cfg["crawler"]["timeout_seconds"]))
            if not html: continue
            for u, atext in extract_links(html, final, domains, max_links):
                if likely_link(atext, u, cfg): candidates.add(u)
        except Exception as e:
            errors.append(f"seed {seed}: {type(e).__name__}: {e}")
        time.sleep(float(cfg["crawler"].get("request_interval_seconds", 0.25)))
    urls=list(candidates)[:max_pages]
    found=[]
    with cf.ThreadPoolExecutor(max_workers=int(cfg["crawler"]["max_workers"])) as ex:
        futs=[ex.submit(process_candidate, session, u, school, cfg) for u in urls]
        for fut in cf.as_completed(futs):
            item, err=fut.result()
            if item: found.append(item)
            if err: errors.append(err)
    return found, errors


def load_existing() -> list[dict[str, Any]]:
    if not JSON_PATH.exists(): return []
    try:
        obj=json.loads(JSON_PATH.read_text(encoding="utf-8"))
        return obj.get("notices", obj if isinstance(obj, list) else [])
    except Exception:
        return []


def merge_notices(old: list[dict[str, Any]], new: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    by_url={canonical_url(x.get("url", "")): x for x in old if canonical_url(x.get("url", ""))}
    new_count=0
    for item in new:
        key=canonical_url(item.get("url", ""))
        if not key: continue
        if key in by_url:
            prev=by_url[key]
            first=prev.get("first_seen") or item["first_seen"]
            manual={k:v for k,v in prev.items() if k.startswith("manual_")}
            prev.update(item); prev["first_seen"]=first; prev.update(manual)
        else:
            by_url[key]=item; new_count+=1
    result=sorted(by_url.values(), key=lambda x:(x.get("published_at", ""), x.get("last_seen", ""), x.get("score", 0)), reverse=True)
    return result, new_count


def write_data(notices: list[dict[str, Any]], report: dict[str, Any], cfg: dict[str, Any]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    meta={
        "generated_at": now_iso(), "publish_year": cfg["target"]["publish_year"],
        "admission_year": cfg["target"]["admission_year"], "total": len(notices),
        "routes": list(cfg["routes"]), "majors": list(cfg["majors"]), "keywords": cfg["keywords"],
        "institution_types": sorted({x.get("institution_type", "其他") for x in cfg.get("schools", [])}),
        "monitored_units": len(cfg.get("schools", [])),
    }
    payload={"meta": meta, "notices": notices, "report": report}
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    JS_PATH.write_text("window.CRAWLER_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="抓取配置中的全部高校和研究单位")
    ap.add_argument("--school", help="只抓取指定高校或研究单位（可部分匹配）")
    ap.add_argument("--validate-config", action="store_true")
    args=ap.parse_args()
    cfg=load_config()
    if args.validate_config:
        types={}
        for x in cfg.get("schools", []): types[x.get("institution_type", "其他")]=types.get(x.get("institution_type", "其他"),0)+1
        print(f"配置有效：{len(cfg.get('schools', []))}个单位；分类={types}；路径={list(cfg['routes'])}；专业={list(cfg['majors'])}")
        return 0
    selected=cfg.get("schools", [])
    if args.school:
        selected=[x for x in selected if args.school in x.get("name", "")]
    if not selected:
        print("没有匹配的高校或研究单位", file=sys.stderr); return 2
    session=make_session(cfg["crawler"]["user_agent"])
    all_new=[]; errors=[]; school_stats=[]
    for i, school in enumerate(selected, 1):
        print(f"[{i}/{len(selected)}] {school['name']}")
        found, errs=discover_school(session, school, cfg)
        all_new.extend(found); errors.extend(errs)
        school_stats.append({"school": school["name"], "institution_type": school.get("institution_type", "其他"), "found": len(found), "errors": len(errs)})
    old=load_existing()
    merged,new_count=merge_notices(old,all_new)
    report={"run_at": now_iso(), "schools_checked": len(selected), "institutions_checked": len(selected), "candidates_kept": len(all_new),
            "new_notices": new_count, "errors": errors[:300], "school_stats": school_stats,
            "search_provider": os.getenv("SEARCH_PROVIDER", cfg.get("search", {}).get("provider", "none"))}
    write_data(merged, report, cfg)
    print(f"完成：保留{len(merged)}条，新增{new_count}条，错误{len(errors)}条")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
