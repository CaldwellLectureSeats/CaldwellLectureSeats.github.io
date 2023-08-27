// import required firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
// import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithCredential, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
// import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
// import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendSignInLinkToEmail, signInWithEmailLink, isSignInWithEmailLink, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
// import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, applyActionCode, sendSignInLinkToEmail, signInWithEmailLink, isSignInWithEmailLink, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, Timestamp, collection, doc, addDoc, setDoc, getDocs, getDoc, updateDoc, arrayUnion, arrayRemove, query, where, deleteField } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js';


// firebase configuration
window.API_KEY = "AIzaSyDtn21mi-DzG-TGErzkkaNqUifB-cC1KQQ";
const firebaseConfig = {
  apiKey: window.API_KEY,
  authDomain: "lectureseats.firebaseapp.com",
  projectId: "lectureseats",
  storageBucket: "lectureseats.appspot.com",
  messagingSenderId: "911998665124",
  appId: "1:911998665124:web:27b4b44bcc6cd3b7054131",
  measurementId: "G-VT95CQX9DC",

  clientId: "911998665124-be5qcdaj4co3082a7kcn6so1638itpjo.apps.googleusercontent.com",
  // scopes: [
  //   "email",
  //   "profile",
  //   "https://www.googleapis.com/auth/drive.file"
  // ],
  // discoveryDocs: [
  //   "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
  // ]
};

// init firebase
const app = initializeApp(firebaseConfig);

// const analytics = getAnalytics(app);



//////////////// auth operations /////////////////////////

// init authentication
window.auth = getAuth();

// bind global onAuth to onAuthStateChanged
window.onAuth = f => onAuthStateChanged(window.auth, f);

// let provider = new GoogleAuthProvider();
// provider.setCustomParameters({
//   prompt: "select_account",
//   login_hint: localStorage.email||null
// });  
// provider.addScope("https://www.googleapis.com/auth/drive.file");

// window.EmailAuthProvider = EmailAuthProvider;

// window.updateProfile=updateProfile;

// debugging
// window.provider=provider;
// window.GoogleAuthProvider=GoogleAuthProvider;
// window.getRedirectResult=getRedirectResult;
// window.signInWithCredential=signInWithCredential;
window.passwordReset=function(email){
  return sendPasswordResetEmail(window.auth, email+'@caldwell.edu');
}

window.signIn=function(email, password){
  return signInWithEmailAndPassword(window.auth, email+'@caldwell.edu', password);
}

window.signUp=function(email, password){
  return createUserWithEmailAndPassword(window.auth, email+'@caldwell.edu', password);
}

window.sendEmailLink=async function(email){
  localStorage.email=email;
  try{
    let r=await sendSignInLinkToEmail(window.auth, email, {url:window.location.href, handleCodeInApp:true});
  }catch(e){
    return {error:e.code};
  }
}
window.trySigningInWithLink=async function(){
  // console.log(localStorage.email, window.location.href);
  // if(localStorage.email && isSignInWithEmailLink(auth, window.location.href)) {
  //   try{
  //     let r=await signInWithEmailLink(window.auth, localStorage.email, window.location.href);
  //     return r;
  //   }catch(e){
  //     return {error:e.code};
  //   }
  // }
}

// window.signIn=async function(){
//   // signInWithRedirect(auth, provider);
//   return signInWithPopup(auth, provider).then(r=>{
//     localStorage.authToken=JSON.stringify({access_token:r._tokenResponse.oauthAccessToken});
//     localStorage._tokenResponse=JSON.stringify(r._tokenResponse);
//   });
//   // const userCred = await getRedirectResult(auth);
//   // console.log(userCred)
// }


////////////// storage operations ////////////////////////

const storage = getStorage();

window.uploadFile = async function(filepath,file){
  try{
    return await uploadBytes(ref(storage,filepath),file);
  }catch(e){
    return {error:e.code};
  }
}

window.getLinkFromStoragePath = async function(filepath){
  if(!filepath)return;
  try{
    console.log(filepath);
    return await getDownloadURL(ref(storage,filepath));
  }catch(e){
    return {error:e.code};
  }
}


////////////// firestore operations //////////////////////

const DATABASE = getFirestore(app);

window.db = {};

window.db.now=()=>Timestamp.now().seconds;

window.db.deleteField = deleteField;
window.db.arrayUnion = arrayUnion;
window.db.arrayRemove = arrayRemove;

window.db.find = async function(collectionName, ...queries){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    if(queries){
      var r=await getDocs(query(collection(DATABASE, collectionName), ...queries.map(q=>where(...q))));
    }else{
      var r=await getDocs(collection(DATABASE, collectionName));
    }
    return r.docs.map(doc=>({id:doc.id, ...doc.data()}));
  }catch(e){
    console.error(e);
    // toast(e.code,'Error');
    return {error:e.code||'unknown error'};
  }
}

// window.db.getIds = async function(collectionName){
//   try{
//     return (await getDocs(collection(DATABASE, collectionName))).docs.map(doc=>doc.id);
//   }catch(e){
//     console.error(e);
//     return false;
//   }
// }

window.db.findOne = async function(collectionName, id){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    var docSnap = await getDoc(doc(DATABASE, collectionName, id));
    return docSnap.exists()?docSnap.data():null;
  }catch(e){
    console.error(e);
    // toast(e.code,'Error');
    return {error:e.code||'unknown error'};
  }
}

window.db.insertOne = async function(collectionName, data, id){
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
    // toast(e.code,'Error');
    return {error:e.code||'unknown error'};
  }
}

window.db.updateOne = async function(collectionName, id, data, ...data2){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    if(data2.length){
      await updateDoc(doc(DATABASE, collectionName, id), data, ...data2);
    }else{
      // console.log('updating',collectionName,id,data)
      await updateDoc(doc(DATABASE, collectionName, id), data);
    }
    return true;
  }catch(e){
    console.error(e);
    // toast(e.code,'Error');
    return {error:e.code||'unknown error'};
  }
}

// window.db.updateOneArrayUnion = async function(collectionName, id, arrayField, data){
//   try{
//     await updateDoc(doc(DATABASE, collectionName, id),{[arrayField]:arrayUnion(data)});
//     return true;
//   }catch(e){
//     console.error(e);
//     return {error:e.code||'unknown error'};
//   }
// }

window.db.upsertOne = async function(collectionName, id, data){
  if(!navigator.onLine)return {error:'You are offline.'};
  try{
    await updateDoc(doc(DATABASE, collectionName, id), data);
    return true;
  }catch(e){
    if(e.code==='not-found' || e.code==='permission-denied'){
      return await window.db.insertOne(collectionName,data,id);
    }
    return {error:e.code||'unknown error'};
  }
}
