# 理论物理 / 天文学保研通知自动抓取系统（高校 + 研究所增强版）

## 已经替你配置好的范围

- **39所原985高校**
- **中科院研究所与国科大培养单位12个**：
  - 中国科学院理论物理研究所
  - 中国科学院大学物理科学学院
  - 中国科学院大学杭州高等研究院基础物理与数学科学学院
  - 中国科学院大学国际理论物理中心（亚太地区，ICTP-AP）
  - 中国科学院国家天文台
  - 中国科学院上海天文台
  - 中国科学院紫金山天文台
  - 中国科学院云南天文台
  - 中国科学院新疆天文台
  - 中国科学院高能物理研究所
  - 中国科学院国家空间科学中心
  - 中国科学院精密测量科学与技术创新研究院

监控路径：**夏令营、预推免**  
专业：**理论物理、天文学**  
关键词：**理论、引力、宇宙、黑洞**

---

# 最省事的部署步骤

## 第1步：注册 Serper 并复制 API Key

1. 打开 Serper 官网并注册账号。
2. 进入控制台，复制 API Key。
3. 不要把 Key 发到公开聊天、README 或代码中。

> 免费额度和价格可能调整，以 Serper 控制台显示为准。本项目每个单位每天只进行 **1次组合搜索**。目前共51个监控单位，因此完整更新约消耗51次查询。

## 第2步：新建 GitHub 仓库

1. 登录 GitHub。
2. 点击右上角 `+` → `New repository`。
3. 仓库名可填写：`physics-baoyan-monitor`。
4. 建议选择 `Public`，这样 GitHub Pages 和 Actions 最省事。
5. 点击 `Create repository`。

## 第3步：上传本项目

1. 解压 ZIP。
2. 打开解压后的文件夹。
3. 在 GitHub 仓库页面点击 `uploading an existing file`。
4. 把文件夹**内部的全部文件和文件夹**拖进去，包括隐藏目录 `.github`。
5. 点击 `Commit changes`。

上传后，仓库根目录应直接看到：

```text
.github/
data/
archive/
config.yaml
crawler.py
index.html
requirements.txt
README.md
```

不要让这些文件再套在第二层同名文件夹里。

## 第4步：保存 Serper API Key

1. 进入仓库 `Settings`。
2. 左侧选择 `Secrets and variables` → `Actions`。
3. 点击 `New repository secret`。
4. Name 填：

```text
SERPER_API_KEY
```

5. Secret 粘贴你从 Serper 复制的 Key。
6. 点击 `Add secret`。

本版本已在工作流中固定使用 Serper，**不需要再创建 SEARCH_PROVIDER，也不需要 Bing Key**。

## 第5步：允许 Actions 自动提交更新

1. 进入 `Settings` → `Actions` → `General`。
2. 找到 `Workflow permissions`。
3. 选择 `Read and write permissions`。
4. 点击 `Save`。

## 第6步：第一次手动运行

1. 打开仓库顶部 `Actions`。
2. 左侧选择 `每日更新保研通知`。
3. 点击右侧 `Run workflow` → `Run workflow`。
4. 等待任务完成并显示绿色勾。
5. 回到仓库，确认 `data/notices.json` 的更新时间发生变化。

## 第7步：开启网页

1. 进入 `Settings` → `Pages`。
2. `Build and deployment` 选择 `Deploy from a branch`。
3. Branch 选择 `main`，目录选择 `/ (root)`。
4. 点击 `Save`。
5. 等待约1—3分钟，页面上方会出现公开网址。

以后 GitHub Actions 将在**每天北京时间09:30**自动运行。也可以随时在 Actions 页面手动运行。

---

# 本地测试（可选）

Windows 双击：

```text
run_once.bat
```

或运行：

```bash
pip install -r requirements.txt
python crawler.py --validate-config
python crawler.py --all
python -m http.server 8000
```

浏览器打开 `http://localhost:8000/`。

本地运行时如需使用 Serper：

### Windows PowerShell

```powershell
$env:SERPER_API_KEY="你的Key"
$env:SEARCH_PROVIDER="serper"
python crawler.py --all
```

### macOS / Linux

```bash
export SERPER_API_KEY="你的Key"
export SEARCH_PROVIDER="serper"
python crawler.py --all
```

---

# 设计说明

- 搜索 API 只负责**发现候选页面**。
- 结果必须属于 `config.yaml` 中配置的官方域名才会被保留。
- 未配置 API Key 时，程序仍可运行，但只抓取已配置的官网入口及其链接，漏报概率更高。
- 截止时间由正则表达式自动抽取，遇到分批报名、页面笔误或“另行通知”时必须打开官方原文复核。
- 旧数据不会因某次抓取失败而被清空。

# 增删研究单位

编辑 `config.yaml` 的 `schools:` 列表。虽然字段名仍叫 `schools`，实际同时存放高校、研究所和国科大培养单位。每项可设置：

```yaml
- name: 中国科学院某研究所
  institution_type: 中科院研究所
  region: 北京
  college: 研究生部
  aliases: [简称, 英文缩写]
  official_domains: [example.cas.cn]
  start_urls:
    - https://example.cas.cn/yjs/zs/
  directions: 理论物理、天文学或相关方向
```
