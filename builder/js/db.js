(function(){
  const DB_NAME='baoyan_pdf_builder';
  const DB_VERSION=1;
  const FILE_STORE='files';
  let dbPromise=null;

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(FILE_STORE)){
          const store=db.createObjectStore(FILE_STORE,{keyPath:'id'});
          store.createIndex('projectId','projectId',{unique:false});
          store.createIndex('materialId','materialId',{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    return dbPromise;
  }

  async function tx(mode,fn){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(FILE_STORE,mode);
      const store=t.objectStore(FILE_STORE);
      let result;
      try{result=fn(store,t);}catch(err){reject(err);return;}
      t.oncomplete=()=>resolve(result);
      t.onerror=()=>reject(t.error);
      t.onabort=()=>reject(t.error||new Error('IndexedDB transaction aborted'));
    });
  }

  async function putFile(record){
    await tx('readwrite',store=>store.put(record));
    return record;
  }
  async function getFile(id){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(FILE_STORE,'readonly').objectStore(FILE_STORE).get(id);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }
  async function deleteFile(id){await tx('readwrite',store=>store.delete(id));}
  async function listProjectFiles(projectId){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const idx=db.transaction(FILE_STORE,'readonly').objectStore(FILE_STORE).index('projectId');
      const req=idx.getAll(IDBKeyRange.only(projectId));
      req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
    });
  }
  async function deleteProjectFiles(projectId){
    const files=await listProjectFiles(projectId);
    await tx('readwrite',store=>files.forEach(f=>store.delete(f.id)));
  }
  async function clearAll(){await tx('readwrite',store=>store.clear());}

  window.BuilderDB={openDb,putFile,getFile,deleteFile,listProjectFiles,deleteProjectFiles,clearAll};
})();
