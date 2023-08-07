
const APP_FOLDER = 'LectureSeats';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const CLIENT_ID = '911998665124-be5qcdaj4co3082a7kcn6so1638itpjo.apps.googleusercontent.com';

async function initGoogleAPI(){
  await new Promise((res, rej) => {
    gapi.load("client:auth2", {callback: res, onerror: rej});
  });
  await gapi.client.init({
    apiKey: window.API_KEY,
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    // client_id: CLIENT_ID,
    // scope: 'https://www.googleapis.com/auth/drive.file',
    // ux_mode: 'redirect',
    // redirect_uri: '#'
  });
}

function signInToGoogleAPI(prompt='select_account'){
  return new Promise(async function(resolve, reject){
    try{
      if(!gapi.client)await initGoogleAPI();
      let tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        // redirect_uri: 'http://127.0.0.1:5500/',
        // ux_mode: 'redirect',
        expires_in: 60*60*12,
        callback: async ()=>{
          let token=gapi.client.getToken();
          if(token){
            localStorage.authToken=JSON.stringify(token);
            resolve(true);
          }else{
            googleAPIsignOut();
            resolve(false);
          }
        },
        error_callback: e=>resolve({error:e.message})
      });
      tokenClient.requestAccessToken({hint:auth?.currentUser?.email, prompt});
    }catch(e){
      reject(e);
    }
  });
}

async function verifyAuthToken(){
  if(!gapi.client)await initGoogleAPI();
  if(!gapi.client.getToken()){
    if(localStorage.authToken){
      gapi.client.setToken(JSON.parse(localStorage.authToken));
    }else{
      return false;
    }
  }
  var r = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token='+gapi.client.getToken().access_token);
  r = await r.json();
  if(r.expires_in)console.log('token expires in',(r.expires_in/60).toFixed(1)+'m');
  return !r.error;
}

function googleAPIsignOut(){
  const token=gapi?.client?.getToken();
  if(token){
    // google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
  }
  delete localStorage.authToken;
}

async function getAllFiles(){
  return (await gapi.client.drive.files.list({
    pageSize: 20,
    fields: '*',
    q: 'trashed = false'
  }))?.result?.files;
}

var folderIds={};
async function getFolderId(folderName,shareEmails){
  if(folderIds[folderName])return folderIds[folderName];
  let r=await gapi.client.drive.files.list({q: "trashed = false and mimeType = '"+FOLDER_TYPE+"' and name = '"+folderName+"'"});
  let files = r.result.files;
  if(files?.length){
    var folderId=files[0].id;
  }else{
    var folderId=await createFolder(folderName,folderName===APP_FOLDER?null:await getFolderId(APP_FOLDER),shareEmails);
  }
  folderIds[folderName]=folderId;
  return folderId;
}

async function createFolder(name,parentFolderId,shareEmails){
  if(parentFolderId===undefined)parentFolderId=await getFolderId(APP_FOLDER);
  var metadata = {
    name, mimeType:FOLDER_TYPE, parents: parentFolderId?[parentFolderId]:[]
  };
  var form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  var res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
  {
    method: 'POST',
    headers: new Headers({ 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token }),
    body: form,
  });
  if(res.ok){
    res = await res.json();
    shareFile(res.id,shareEmails)
    return res.id;
  }
}

//TODO: this is only for text files, need to update to upload images
async function uploadFile(name,fileBlob,folderId,shareEmails){
  if(folderId===undefined)folderId=await getFolderId(APP_FOLDER);
  var metadata = { name, parents:[folderId] }; //, mimeType:fileBlob.type
  var form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileBlob);
  var res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
  {
    method: 'POST',
    headers: new Headers({ 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token }),
    body: form,
  });
  if(res.ok){
    res = await res.json();
    shareFile(res.id,shareEmails)
    return res.id;
  }else{
    console.log(res);
    return null;
  }
}

async function fetchPostForm(url,headers,body){
  var form = new FormData();
  for(key in body){
    form.append(key,body[key]);
  }
  var res=await fetch(url,
  {
    method: 'POST',
    headers: new Headers(headers),
    body: form,
  });
  if(res.ok){
    return await res.text();
  }else{
    console.warn(res);
    return null;
  }
}

function shareFile(fileId,emails){
  if(!emails)return;
  if(emails?.constructor!==Array)emails=[emails];
  for(var email of emails){
    let resource={role:'reader',withLink:true};
    if(email==='all'){
      resource.value='anyone';
      resource.type='anyone';
    }else{
      resource.type='user';
      resource.emailAddress=email;
    }
    gapi.client.drive.permissions.create({
      fileId,resource
    }).then(response=>{
      console.log('File shared successfully.');
      console.log('Permission ID: ' + response.result.id);
      // console.log(response)
    }).catch(error=>{
      console.error('Error sharing file: ' + error.message);
    });
  }
  // can get a download link via:
  //  await gapi.client.drive.files.get({fileId:fileId,fields: 'webContentLink'});
  // can later get shared file contents
  //  (await gapi.client.drive.files.get({fileId, mimeType:'text/plain', alt:'media'})).body
  // or via a link; e.g. img.src = 'https://drive.google.com/uc?id='+fileId
}

function getLinkFromFileId(fileId){
  if((!fileId) || fileId?.startsWith('http'))return fileId;
  return 'https://drive.google.com/uc?id='+fileId;
}
