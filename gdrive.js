
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
  });
}

function signInToGoogleAPI(){
  let tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    expires_in: 60*60*12,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: ()=>{
      let token=gapi.client.getToken();
      if(token){
        localStorage.authToken=JSON.stringify(token);
      }else{
        googleAPIsignOut();
        return;
      }
      // hide sign-in button, display main
      mainDiv.classList.remove('hidden');
      $('#enableGoogleDriveDiv').classList.add('hidden');
    }
  });
  tokenClient.requestAccessToken({hint: auth.currentUser.email, prompt: 'consent'});
}

async function verifyAuthToken(){
  if(!gapi.client.getToken()){
    if(localStorage.authToken){
      gapi.client.setToken(JSON.parse(localStorage.authToken));
    }else{
      return false;
    }
  }
  var r = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token='+gapi.client.getToken().access_token);
  r = await r.json();
  return !r.error;
}

function googleAPIsignOut(){
  const token=gapi?.client?.getToken();
  if(token){
    google.accounts.oauth2.revoke(token.access_token);
  }
  gapi.client.setToken('');
  delete localStorage.authToken;
}

function testDrive(){
  gapi.client.drive.files.list({
    pageSize: 20,
    fields: '*',
    q: 'trashed = false'
  }).then(r=>console.log(r.result.files.map(f=>f.name + ' : ' + f.mimeType)))
}

var appFolderId;
async function getAppFolderId(){
  if(appFolderId)return appFolderId;
  let r=await gapi.client.drive.files.list({q: "trashed = false and mimeType = '"+FOLDER_TYPE+"' and name = '"+APP_FOLDER+"'"});
  let files = response.result.files;
  if(file?.length){
    appFolderId=files[0].id;
  }else{
    appFolderId=(await createFolder(APP_FOLDER,null)).id;
  }
  return appFolderId;
}

async function createFolder(name,parentFolderId=appFolderId,shareEmails){
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
async function uploadFile(name, fileContent, folderId=appFolderId, shareEmails){
  var metadata = {
    name, mimeType:'text/plain', parents:folderId?[folderId]:[],
  };
  var form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileContent], {type: 'text/plain'}));
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

function shareFile(fileId,emails){
  if(!emails)return;
  if(emails?.constructor!==Array)emails=[emails];
  for(var email of emails){
    gapi.client.drive.permissions.create({
      'fileId': fileId,
      'resource': {
        type: 'user',
        role: 'reader',
        emailAddress: email,
        withLink: true
      }
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
}
