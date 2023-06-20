// import required firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
// import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, Timestamp, FieldPath, collection, doc, addDoc, setDoc, getDocs, getDoc, updateDoc, arrayUnion, query, where, deleteField } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

// firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDtn21mi-DzG-TGErzkkaNqUifB-cC1KQQ",
  authDomain: "lectureseats.firebaseapp.com",
  projectId: "lectureseats",
  storageBucket: "lectureseats.appspot.com",
  messagingSenderId: "911998665124",
  appId: "1:911998665124:web:27b4b44bcc6cd3b7054131",
  measurementId: "G-VT95CQX9DC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// const analytics = getAnalytics(app);

// init authentication
window.auth = getAuth();

// bind global onAuth to onAuthStateChanged
window.onAuth = f => onAuthStateChanged(window.auth, f);
// window.gauth = GoogleAuthProvider;
// window.signInWithRedirect = signInWithRedirect;
// window.signInWithPopup = signInWithPopup;

const DATABASE = getFirestore(app);

window.db = {};

window.db.now=()=>Timestamp.now().seconds;

window.db.FieldPath = FieldPath;

window.db.deleteField = deleteField;

window.db.arrayUnion = arrayUnion;

window.db.find = async function(collectionName, ...queries){
  try{
    if(queries){
      var r=await getDocs(query(collection(DATABASE, collectionName), ...queries.map(q=>where(...q))));
    }else{
      var r=await getDocs(collection(DATABASE, collectionName));
    }
    return r.docs.map(doc=>({id:doc.id, ...doc.data()}));
  }catch(e){
    console.error(e);
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
  try{
    var docSnap = await getDoc(doc(DATABASE, collectionName, id));
    return docSnap.exists()?docSnap.data():null;
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.insertOne = async function(collectionName, data, id){
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
  try{
    if(data2.length){
      await updateDoc(doc(DATABASE, collectionName, id), data, ...data2);
    }else{
      console.log('updating',collectionName,id,data)
      await updateDoc(doc(DATABASE, collectionName, id), data);
    }
    return true;
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.updateOneArrayUnion = async function(collectionName, id, arrayField, data){
  try{
    await updateDoc(doc(DATABASE, collectionName, id),{[arrayField]:arrayUnion(data)});
    return true;
  }catch(e){
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}

window.db.upsertOne = async function(collectionName, id, data){
  try{
    await updateDoc(doc(DATABASE, collectionName, id), data);
    return true;
  }catch(e){
    if(e.code==='not-found'){
      return await window.db.insertOne(collectionName,data,id);
    }
    console.error(e);
    return {error:e.code||'unknown error'};
  }
}
