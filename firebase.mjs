// import required firebase functions

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailLink, isSignInWithEmailLink, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFirestore, serverTimestamp, Timestamp, collection, doc, addDoc, setDoc, getDocs, getDoc, updateDoc, deleteDoc, writeBatch, deleteField, FieldPath, query, where, documentId, orderBy, startAt, endBefore, limit, getCountFromServer } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getBytes, getMetadata, getDownloadURL, list, listAll, deleteObject } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js';


// domain restriction


// firebase configuration
const API_KEY = "AIzaSyDtn21mi-DzG-TGErzkkaNqUifB-cC1KQQ";
const firebaseConfig = {
  apiKey: API_KEY,
  authDomain: "lectureseats.firebaseapp.com",
  projectId: "lectureseats",
  storageBucket: "lectureseats.appspot.com",
  messagingSenderId: "911998665124",
  appId: "1:911998665124:web:27b4b44bcc6cd3b7054131",
  measurementId: "G-VT95CQX9DC",
  // clientId: "911998665124-be5qcdaj4co3082a7kcn6so1638itpjo.apps.googleusercontent.com",
};

// init firebase
const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);

const DOMAIN='@caldwell.edu';

//////////////// auth operations /////////////////////////

// init authentication
window.auth = getAuth();

// bind global onAuth to onAuthStateChanged
window.onAuth = f => onAuthStateChanged(window.auth, f);

window.isSignInWithEmailLink=isSignInWithEmailLink;

window.passwordReset=function(email){
  return sendPasswordResetEmail(window.auth, email+DOMAIN);
}

window.signIn=function(email, password){
  return signInWithEmailAndPassword(window.auth, email+DOMAIN, password);
}

window.signUp=function(email, password){
  return createUserWithEmailAndPassword(window.auth, email.toLowerCase()+DOMAIN, password);
}

window.sendEmailLink=async function(email){
  try{
    await sendSignInLinkToEmail(window.auth, email+DOMAIN, {url:window.location.href, handleCodeInApp:true});
  }catch(e){
    console.error(e);
    return {error:e.code};
  }
}

window.trySigningInWithLink=async function(path,email){
  try{
    let r=await signInWithEmailLink(window.auth,email+DOMAIN,path);
    return r;
  }catch(e){
    return {error:e.code};
  }
}

window.sendEmailVerification=sendEmailVerification;


////////////// storage operations ////////////////////////

const storage = getStorage();
var downloadURLs={};
window.downloadURLs=downloadURLs;
window.storage=storage;
window.storageRef=path=>ref(storage,path);
// window.updateMetadata=updateMetadata;

window.uploadFile = async function(filepath,file){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    return await uploadBytes(ref(storage,filepath),file);
  }catch(e){
    return {error:e.code};
  }
}

async function copyFile(oldRef,newRef){
  let metadata=await getMetadata(oldRef);
  let bytes = await getBytes(oldRef);
  let r = await uploadBytes(newRef,bytes,metadata);
  return r;
}

window.moveFiles = async function(oldPath,newPath){
  if(!navigator.onLine)return {error:'You are offline.'};
  let errorTypes=new Set(), warnTypes=new Set(), failCopy=0, failDel=0, r={ok:0,okCopy:0};
  for(let fileRef of (await list(ref(storage,oldPath))).items){
    try{
      await copyFile(fileRef,ref(storage,newPath+'/'+fileRef.name));
      r.okCopy++;
      delete downloadURLs[oldPath+'/'+fileRef.name];
    }catch(e){
      failCopy++;
      errorTypes.add(e.code);
    }
    try{
      await deleteObject(fileRef);
      r.ok++;
    }catch(e){
      failDel++;
      warnTypes.add(e.code);
    }
  }
  if(failCopy){
    r.error=`Failed to copy ${failCopy} of ${failCopy+r.okCopy} files (${[...errorTypes]})`;
  }
  if(failDel){
    r.warn=`Failed to delete ${failDel} of the old files after copying (${[...warnTypes]})`;
  }
  return r;
}

window.deleteFile = async function(filepath){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    await deleteObject(ref(storage,filepath));
    console.log('Deleted',filepath);
    return {ok:1};
  }catch(e){
    if(e.code==='storage/object-not-found'){
      console.warn('No such file',filepath);
      return {ok:0};
    }
    console.error('Could not delete',filepath,e);
    return {error:e.code};
  }
}

window.deleteFiles = async function(folderPath){
  if(!navigator.onLine)return {error:'You are offline.'};
  let ok=[], errors=new Set(), r={};
  for(let f of (await list(ref(storage,folderPath))).items){
    try{
      ok.push(await deleteObject(f));
      console.log(`Deleted ${folderPath}/${f.name}`);
    }catch(e){
      errors.add(e.code);
      console.error(`Couldn't delete ${folderPath}/${f.name}`,e);
    }
  }
  if(ok.length)r.ok=ok.length;
  if(errors.size===1)r.error=[...errors][0];
  else if(errors.size)r.error=[...errors];
  return r;
}

window.getLinkFromStoragePath = async function(filepath){
  if(!navigator.onLine)return {error:'You are offline.'};
  if(!filepath)return;
  try{
    let r=downloadURLs[filepath];
    if(!r){
      r=downloadURLs[filepath]=await getDownloadURL(ref(storage,filepath));
    }
    return r;
  }catch(e){
    return {error:e.code};
  }
}

// async function listRecursively(filepath){
//   try{
//     let r=await listAll(ref(storage,filepath));
//     return r.items.concat(await Promise.all(r.prefixes.map(p=>listRecursively(p)))).flat();
//   }catch(e){
//     let r=[];
//     r.error=e.code;
//     return r;
//   }
// }

// window.getLinksFromStoragePath = async function(filepath){
//   if(!filepath)return;
//   let r=await listRecursively(filepath);
//   let links=[];
//   for(let fileref of r){
//     links.push(downloadURLs[fileref.fullPath]=await getDownloadURL(fileref));
//   }
//   console.log(downloadURLs)
//   return links;
// }

async function getOneFileInPath(path){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    let r=await listAll(ref(storage,path));
    if(r.items.length){
      return r.items[0];
    }else{
      for(let folder of r.prefixes){
        let r=getOneFileInPath(folder);
        if(r)return r;
      }
    }
  }catch(e){
    return {error:e.code};
  }
}

window.getOneLinkFromStoragePath = async function(path){
  if(!navigator.onLine)return {error:'You are offline.'};
  if(!path)return;
  try{
    for(let fullPath in downloadURLs){
      if(fullPath.startsWith(path+'/')){
        return downloadURLs[fullPath];
      }
    }
    let r=await getOneFileInPath(path);
    if(!r||r.error)return r;
    downloadURLs[r.fullPath]=await getDownloadURL(r);
    return downloadURLs[r.fullPath];
  }catch(e){
    return {error:e.code};
  }
}


////////////// firestore operations //////////////////////

const DATABASE = getFirestore(app);

window.db = {};

window.db.serverTimestamp=serverTimestamp;
window.db.Timestamp=Timestamp;
window.db.now=()=>Timestamp.now().seconds;

window.db.makeTimestamp=function(dateTime,minutesOffset=0){
  if(dateTime.constructor===Array)dateTime=dateTime.join(' ');
  return db.Timestamp.fromMillis((new Date(dateTime).getTime()+minutesOffset*60000));
}

window.db.fieldPath=(...path)=>new FieldPath(...path);
window.db.deleteField = deleteField;
window.db.where = where;
window.db.orderBy = orderBy;
window.db.startAt = startAt;
window.db.endBefore = endBefore;
window.db.limit = limit;
window.db.documentId = documentId;

window.db.startsWith=(field,txt)=>[where(field,'>=',txt),where(field,'<',txt+'\uf8ff')];

// Ex: cnt=await db.count('users',[db.documentId(),'>=','v'],[db.documentId(),'<','w'])
window.db.count = async function(collectionName, ...constraints){
  try{
    let r;
    if(constraints){
      r=await getCountFromServer(query(collection(DATABASE, collectionName), ...constraints));
    }else{
      r=await getCountFromServer(collection(DATABASE, collectionName));
    }
    return r.data().count;
  }catch(e){
    return {error:e.code||'unknown error'};
  }
}

// Ex: docs=await db.find('users',[db.documentId(),'>=','v'],[db.documentId(),'<','w'])
window.db.find = async function(collectionName, ...constraints){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    if(constraints?.length){
      var r=await getDocs(query(collection(DATABASE, collectionName), ...constraints));
    }else{
      var r=await getDocs(collection(DATABASE, collectionName));
    }
    let resultMap={};
    r.docs.forEach(doc=>resultMap[doc.id]=doc.data());
    return resultMap;
  }catch(e){
    console.error(e);
    // toast(e.code,'Error');
    return {error:e.code||'unknown error'};
  }
}

window.db.getDoc = async function(collectionName, id){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    var docSnap = await getDoc(doc(DATABASE, collectionName, id));
    return docSnap.exists()?docSnap.data():null;
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.deleteOne = async function(collectionName, id){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    await deleteDoc(doc(DATABASE, collectionName, id));
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.insertOne = async function(collectionName, id, data){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    if(id){
      var docRef = await setDoc(doc(DATABASE, collectionName, id), data);
      return id;
    }else{
      docRef = await addDoc(collection(DATABASE, collectionName), data);
      return docRef.id;
    }
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.updateOne = async function(collectionName, id, data, ...data2){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    if(data2.length){
      await updateDoc(doc(DATABASE, collectionName, id), data, ...data2);
    }else{
      await updateDoc(doc(DATABASE, collectionName, id), data);
    }
    return true;
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.updateBatch = async function(...updates){
  // each update in updates must be an object with fields {collection, id, data}
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    const batch = writeBatch(DATABASE);
    for(let update of updates){
      batch.update(doc(DATABASE,update.collection,update.id),update.data);
    }
    await batch.commit();
    return true;
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.upsertOne = async function(collectionName, id, data){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    await setDoc(doc(DATABASE, collectionName, id), data, {merge:true});
    return true;
  }catch(e){
    return {error:e.code||'unknown error'};
  }
}

window.db.upsertBatch = async function(...updates){
  // each update in updates must be an object with fields {collection, id, data}
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    const batch = writeBatch(DATABASE);
    for(let update of updates){
      batch.set(doc(DATABASE,update.collection,update.id),update.data,{merge:true});
    }
    await batch.commit();
    return true;
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}
