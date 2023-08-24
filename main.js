'use strict'


//TODO:
//  avoid collisions with reserved fields
//    make sure RESERVED_ATTEND_FIELDS can never collide with usernames
//      start them all with periods? make reserved ones in caps and lowercase usernames?
//    make sure SEMESTER_SECTION_SEPARATOR doesn't appear in semester or section titles


/////////////////// Constants //////////////////////

const SEMESTER_SECTION_SEPARATOR = '|';
const INSTRUCTOR=1, ADMIN=2;
const REQUIRED_LOC=1, REQUIRED_SEAT=2, REQUIRED_PHOTO=4;
const PHOTO_TIMEOUT=60000;
const RESERVED_ATTEND_FIELDS=['i','c','e','_a'];
const DEFAULT_USER_IMG='user512.png';



////////////// Helper functions ////////////////////

const $ = document.querySelector.bind(document);

function makeFirstElementChild(parent, child){
  if(parent.firstElementChild!==child){
    parent.insertBefore(child,parent.firstElementChild);
  }
}

function hide(e){
  (typeof(e)==='string'?document.getElementById(e):e).classList.add('hidden');
}

function show(e){
  (typeof(e)==='string'?document.getElementById(e):e).classList.remove('hidden');
}

function pad0(i,len=2){
  return i.toString().padStart(len,'0');
}

function getDateTime(){
  let d=new Date(),
  date=d.getFullYear()+'-'+pad0(d.getMonth()+1)+'-'+pad0(d.getDate()),
  time=pad0(d.getHours())+':'+pad0(d.getMinutes());
  return [date,time];
}

async function getLocation(){
  try{
    let r=await new Promise(function(resolve, reject) {
      navigator.geolocation.getCurrentPosition(resolve, reject, {maximumAge:300000, timeout:5000, enableHighAccuracy: true});
    });
    return r.coords;
  }catch(e){
    return {error:e.message};
  }
}

function download(filename, text) {
  var a=document.createElement('a');
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  a.setAttribute('download', filename);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function spinOnce(element){
  element.style.animation='';element.offsetWidth;element.style.animation='spin 0.5s';
}

function isMatch(obj,filter){
  if(!filter)return true;
  for(let filterKey in filter){
    if(obj[filterKey]!==filter[filterKey])return false;
  }
  return true;
}


///////////// Initialize and Sign in ///////////////

var userDoc;
window.addEventListener('load', async function(){
  // check if url is a link sign-in
  await trySigningInWithLink();
  // ensure clean path
  window.history.pushState(null,'LectureSeats',location.origin+this.location.pathname);
  // login functionality
  onAuth(checkSignIn, error=>toastError('Authentication error.\n\n'+error));
});

async function checkSignIn(user){
  if(user||auth.currentUser){ // User is signed in
    // hide sign-in button
    hide('signin');
    // display main, display user info
    show(mainDiv);
    show('user');
    userDoc=await db.findOne('users',user.email);
    // if this is a new user, update their record in the database
    if(userDoc?.error){
      toastError('Failed to search database.\n\n'+userDoc.error);
      return;
    }
    // save userDoc for new user
    if(userDoc===null){
      userDoc={};
      let r=await db.insertOne('users', userDoc, user.email);
      if(r.error){
        toastError('Could not add user to database.\n\n'+r.error.code);
        return;
      }
    }
    if(!userDoc.n){
      forceInMain('profile','Please enter your name and save.');
    }
    // display user email, name, photo
    $('#userDisplayName').innerText=user.email;
    // $('#displayEmail').innerText=user.email;
    // $('#userPhoto').src=userDoc.p||DEFAULT_USER_IMG;
    nameInput.value=nameInput.lastValue=userDoc.n||'';
    // display instructor and admin options, depending on permissions
    if(userDoc.rl&INSTRUCTOR || userDoc.rl&ADMIN){
      show('roomsBtn');
      show('allSectionsBtn');
    }
    // fill semester options
    let option;
    let semesterSelect=$('#semesterSelect');
    if(semesterSelect.children.length==1){
      let semesters = await getSemesters();
      for(let semester of semesters){
        option = semesterSelect.appendChild(document.createElement('option'));
        option.id = option.value = option.innerText = semester;
        if(option.id==localStorage.semesterSelected){
          option.setAttribute('selected',true);
          showEnrolledAndTeachingSections(semester);
        }
      }
    }
    // prefill saved values
    if(localStorage.minutesToCollectAttendance){
      minutesToCollectAttendance.innerText=localStorage.minutesToCollectAttendance;
    }
    // if in the middle of taking attendance, go to attendance-taking section
    if(localStorage.takingAttendance && parseInt(localStorage.attendanceEndtime)>db.now()){
      showGetAttendance();
      takingAttendance();
    }
  }else{
    // User is signed out: Display sign-in button, hide main
    show('signin');
    hide(mainDiv);
    hide('user');
  }
}

function authErrorHandling(error){
  switch(error.code){
    case 'auth/email-already-in-use':
    toastError(`Email address ${$('#signInEmailInput').value}@caldwell.edu already in use.`);
    break;
    case 'auth/invalid-email':
    toastError(`Email address ${$('#signInEmailInput').value}@caldwell.edu is invalid.`);
    break;
    case 'auth/operation-not-allowed':
    toastError(`Error during sign up.`);
    break;
    case 'auth/user-not-found':
    toastError(`User ${$('#signInEmailInput').value}@caldwell.edu not found.\nDid you mean to click the Register button?`);
    break;
    case 'auth/missing-password':
    toastError('No password provided.');
    break;
    case 'auth/weak-password':
    toastError('Password is not strong enough. Add additional characters including special characters and numbers.');
    break;
    default:
    toastError(error.message);
    break;
  }
}

function signInButtonClick(){
  signIn($('#signInEmailInput').value,$('#signInPasswordInput').value)
  .then(a=>console.log(a))
  .catch(authErrorHandling);
}

function registerButtonClick(){
  signUp($('#signInEmailInput').value,$('#signInPasswordInput').value)
  .then(a=>console.log(a))
  .catch(authErrorHandling);
}

function signOut(){
  auth.signOut();
}


///////////////////// Navigation ///////////////////

const mainDiv = $('#main');

var navAllowed=true;
var navDisallowMessage;
function allowNav(){
  navAllowed=true;
  navDisallowMessage=null;
}
function disallowNav(disallowMsg){
  navAllowed=false;
  navDisallowMessage=disallowMsg;
}

window.onhashchange=function(event){
  if(navAllowed){
    makeFirstElementChild(mainDiv,$(location.hash||'#sections'));
  }else if(location.hash!=='#_'){
    location.hash='#_';
  }
}
function showInMain(childOfMain){
  if(navAllowed)window.location.hash=childOfMain;
  else if(navDisallowMessage)toast(navDisallowMessage);
}
function forceInMain(childOfMain,disallowMsg){
  makeFirstElementChild(mainDiv,$('#'+childOfMain));
  disallowNav(disallowMsg);
}
function navigateBack(){
  if(navAllowed)history.back();
}

window.addEventListener('keydown',e=>{
  //TODO: check that this works; disable repeats
  if(e.key==='Escape'){
    navigateBack();
  }
});

// ensure we don't navigate away from taking attendance until it's stopped
window.addEventListener('popstate',event=>{
  if(location.hash!=='#getAttendance' && location.hash!=='#QRcode' && location.hash!=='#room' && localStorage.takingAttendance && parseInt(localStorage.attendanceEndtime)>db.now()){
    showGetAttendance();
    takingAttendance();
  }
})

function loadingScreen(on){
  if(on){
    // $('fieldset').setAttribute('disabled',true);
    show('loading');
    disallowNav();
  }else{
    // $('fieldset').removeAttribute('disabled');
    hide('loading');
    allowNav();
  }
}

//////////// Get semesters, sections, rooms ////////

var allSections={},allRooms=[],allSemesters=['2023Fall','2024Winter','2024Spring'],allAttendances={};

async function getSemesters(){
  return ['2023Fall','2024Winter','2024Spring'];
}

async function getSections(semester){
  if(semester && !allSections[semester]){
    allSections[semester]=await db.findOne('sections',semester);
    if(allSections[semester]===null){
      allSections[semester]={};
    }else if(allSections[semester].error){
      toastError('Something went wrong.\n\nTry to reload.');
      return;
    }
  }
  return allSections[semester];
}

async function getSection(semester,sectionId){
  let sections=await getSections(semester);
  if(sections)return sections[sectionId];
}

async function getRooms(){
  if(!allRooms?.length){
    allRooms=await db.find('rooms');
  }
  return allRooms;
}

async function getRoom(roomId){
  return (await getRooms()).filter(r=>r.id===roomId)[0];
}

async function getRoomMap(roomId){
  return (await getRoom(roomId)).rm.toLowerCase().split('\n').map(r=>r.split('\t'));
}

async function getAttendance(semester,sectionIds,refresh,filter){
  if(sectionIds.constructor!==Array)sectionIds=[sectionIds];
  var result={};
  for(var sectionId of sectionIds){
    let attendId=semester+SEMESTER_SECTION_SEPARATOR+sectionId;
    if(refresh || !allAttendances[attendId]){
      allAttendances[attendId]=await db.findOne('attend',attendId);
      if(allAttendances[attendId]===null){
        allAttendances[attendId]={};
      }else if(allAttendances[attendId].error){
        toastError('Something went wrong.\n\nPlease try again.');
        return;
      }else{
        for(let field of RESERVED_ATTEND_FIELDS){
          delete allAttendances[attendId][field];
        }
        for(let userId in allAttendances[attendId]){
          allAttendances[attendId][userId].sid=sectionId;
        }
      }
    }
    for(let userId in allAttendances[attendId]){
      result[userId]=allAttendances[attendId][userId];
      result[userId].a=Object.entries(result[userId].a).map(([code,doc])=>Object.assign({code},doc)).filter(doc=>isMatch(doc,filter)).sort((doc1,doc2)=>(doc1.d+doc1.t>doc2.d+doc2.t)?1:-1);
    }
  }
  return result;
}


//////////////// Mark Attendance ///////////////////

const markAttendanceSectionId=$('#markAttendanceSectionId');
const markAttendanceClassCodeInput=$('#markAttendanceClassCodeInput');
const markAttendanceLocation=$('#markAttendanceLocation');

async function showMarkAttendance(sectionId,section){
  showInMain('markAttendance');
  markAttendanceSectionId.innerText=sectionId;
  $('#markAttendanceRemoveButtonSectionId').innerText=sectionId;
  markAttendanceSectionId._sectionDoc=section;
  markAttendanceClassCodeInput.value='';
  $('#markAttendanceSeatCodeInput').value='';
  show('defaultSelfieImg');
  show('addPhotoBtn');
  hide(selfieCanvas);
  hide(selfieVideo);
  hide('snapPhotoBtn');
  hide('switchPhotoBtn');
  showMarkedAttendances(localStorage.semesterSelected,sectionId);
  checkMissingAttendanceInfo();
}

async function validateSeat(seatCode,roomCode){
  seatCode=seatCode?.toLowerCase()?.trim();
  if(!seatCode)return;
  return (await getRoomMap(roomCode)).flat().indexOf(seatCode)>=0;
}

async function checkMissingAttendanceInfo(){
  const markAttendanceRequirementsList=$('#markAttendanceRequirementsList');
  markAttendanceRequirementsList.innerHTML='';
  // check passcode
  if(!markAttendanceClassCodeInput.value){
    markAttendanceRequirementsList.appendChild(document.createElement('li')).innerText='Attendance passcode';
  }
  // check location permissions
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_LOC){
    $('label[for="markAttendanceLocation"]').classList.add('required');
  }else{
    $('label[for="markAttendanceLocation"]').classList.remove('required');
  }
  if(!markAttendanceLocation.value){
    let r=await getLocation();
    if(r.error){
      hide(markAttendanceLocation);
      if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_LOC){
        show('markAttendanceLocationOffButRequired');
        markAttendanceRequirementsList.appendChild(document.createElement('li')).innerText='Location';
      }else{
        show('markAttendanceLocationOff');
      }
    }else{
      markAttendanceLocation.value=r;
      show(markAttendanceLocation);
      hide('markAttendanceLocationOff');
    }
  }
  // check seat code, if required
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_SEAT){
    $('label[for="markAttendanceSeatCodeInput"]').classList.add('required');
  }else{
    $('label[for="markAttendanceSeatCodeInput"]').classList.remove('required');
  }
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_SEAT && !(await validateSeat($('#markAttendanceSeatCodeInput').value,markAttendanceSectionId._sectionDoc.r))){
    markAttendanceRequirementsList.appendChild(document.createElement('li')).innerText='Valid seat code';
  }
  // check photo, if required
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_PHOTO){
    $('label[for="selfieCanvas"]').classList.add('required');
  }else{
    $('label[for="selfieCanvas"]').classList.remove('required');
  }
  let validPhoto=selfieBlob?.size && photoTakenTime && (new Date().getTime()-photoTakenTime)<PHOTO_TIMEOUT;
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_PHOTO && !validPhoto){
    show('defaultSelfieImg');
    hide(selfieCanvas);
    hide(selfieVideo);
    selfieBlob=photoTakenTime=null;
    markAttendanceRequirementsList.appendChild(document.createElement('li')).innerText='New photo';
  }
  // if any info is missing, display this and disable Mark Attendance button
  if(markAttendanceRequirementsList.innerHTML){
    $('#markAttendanceButton').setAttribute('disabled',true);
    show('markAttendanceRequirements');
    // toast(markAttendanceRequirementsList.innerHTML,'Missing required attendance info',-1);
  }else{
    $('#markAttendanceButton').removeAttribute('disabled');
    hide('markAttendanceRequirements');
  }
}

function showMarkedAttendances(semester,sectionId){
  let attendanceMarkedDiv=$('#attendanceMarked');
  if(userDoc[semester][sectionId]?.length){
    attendanceMarkedDiv.innerHTML='Attendance marked:';
    for(let attended of userDoc[semester][sectionId]){
      let d=attendanceMarkedDiv.appendChild(document.createElement('div'));
      d.innerText=attended.dt;
      // if(!attended[0])d.setAttribute('failed',true);
      //TODO: show failed?
    }
    mainDiv.scrollTop=0;
  }else{
    attendanceMarkedDiv.innerHTML='';
  }
}

$('#markAttendanceRemoveButton').addEventListener('click',async e=>{
  if(confirm('Are you sure you would like to remove this section from the list of sections you are enrolled in?')){
    let sectionId=markAttendanceSectionId.innerText;
    let r=await db.updateOne('users',auth.currentUser.email,{[localStorage.semesterSelected+'.'+sectionId]:db.deleteField()});
    if(r.error){
      toastError('Something went wrong. Please try again.');
    }else{
      delete userDoc[localStorage.semesterSelected][sectionId];
      showEnrolledAndTeachingSections(localStorage.semesterSelected);
      navigateBack();
    }
  }
});

$('#markAttendanceButton').addEventListener('click',checkInfoAndMarkAttendance);

async function checkInfoAndMarkAttendance(){
  // check if any info is missing (and get new location coords)
  markAttendanceLocation.value=null;
  await checkMissingAttendanceInfo();
  if(!markAttendanceRequirementsList.innerHTML){
    let code=markAttendanceClassCodeInput.value;
    let sectionId=markAttendanceSectionId.innerText;
    let semester=localStorage.semesterSelected;
    if(userDoc[semester][sectionId].map(doc=>doc.a).includes(code)){
      toast('You have previously marked attendance with this same attendance passcode.','Your attendance was NOT marked.',-1);
      return;
    }
    // collect all info
    loadingScreen(true);
    let section=markAttendanceSectionId._sectionDoc;
    let seat=$('#markAttendanceSeatCodeInput').value;
    let loc=markAttendanceLocation.value;
    if(loc)loc=[loc.latitude,loc.longitude,loc.accuracy];
    let currentDT=getDateTime();
    if(!section.attended)section.attended=[];
    // try to mark attendance, then display success or fail messages
    let r=await markAttendance(semester,sectionId,code,seat,selfieBlob,loc,currentDT[0],currentDT[1]);
    if(r?.error){
      showMarkedAttendances(semester,sectionId);
      toast(r.error,'Your attendance was NOT marked.',-1);
    }else{
      showMarkedAttendances(semester,sectionId);
      toast('Your attendance was marked.','Success!',1);
    }
    loadingScreen(false);
  }else{
    toast('Missing some of the required fields.','',-1);
  }
}

function photoStoragePath(user,semester,sectionId,code){
  return [user,semester,sectionId,code+'.jpg'].join('/');
}

async function markAttendance(semester,sectionId,code,seat,photoBlob,loc,date,time){
  let user=auth.currentUser.email.split('@')[0].replaceAll('.','_');
  let codeField=`${user}.a.${code}`, nameField=`${user}.n`, photoField=`${user}.p`;
  let attendDoc={d:date,t:time};
  let data={'_a':code, [nameField]:userDoc.n, [codeField]:attendDoc};
  // let data={n:userDoc.n,d:date,t:time,a:code};
  if(photoBlob?.size){
    photoId=photoStoragePath(user,semester,sectionId,code);
    // photoId=[user,semester,sectionId,date+'-'+time.split(':').join('-')+'.jpg'].join('/');
    let r=await uploadFile(photoId,photoBlob);
    if(r?.error){
      return {error:'Unable to save photo.\nPlease try again.\n\n'+r.error};
    }
    attendDoc.p=true;
    data[photoField]=photoId;
  }
  if(seat)attendDoc.s=seat;
  if(loc)attendDoc.l=loc;
  let r=await db.updateOne('attend',semester+SEMESTER_SECTION_SEPARATOR+sectionId,data);
  // let r=await db.updateOne('attend',semester+SEMESTER_SECTION_SEPARATOR+sectionId,{'_a':code, [user]:db.arrayUnion(data)});
  if(r?.error){
    return {error:'Please make sure the instructor is taking attendance, and that your attendance passcode is correct.'};
  }
  r=await db.updateOne('users',auth.currentUser.email,{[semester+'.'+sectionId]:db.arrayUnion({a:code,dt:date+' '+time})});
  if(r?.error){
    return {error:'Your attendance was marked (the instructor knows you attended), but failed to save in your personal attendance history.'};
  }
  userDoc[semester][sectionId].push({a:code,dt:date+' '+time});
}


//////////////// Code scanner ///////////////////

// function openQRreader(target){
//   showInMain('QRreader');
//   var html5QrcodeScanner = new Html5QrcodeScanner("QRreaderVideo", {fps:10,qrbox:250});
//   html5QrcodeScanner.render(onScanSuccess);
//   function closeQRreader(){
//     html5QrcodeScanner.clear();
//     window.removeEventListener('popstate',closeQRreader);
//   }
//   window.addEventListener('popstate',closeQRreader);
//   function onScanSuccess(decodedText,decodedResult){
//     document.getElementById(target).value=decodedText;
//     closeQRreader();
//     navigateBack();
//   }
// }

const codeReader=new ZXing.BrowserMultiFormatReader();
var currentQRstream;
var scanTarget;

async function openQRreader(target){
  showInMain('QRreader');
  currentQRstream=await getVideoStream(false);
  scanTarget=target;
  startQRreader();
  window.addEventListener('popstate',closeQRreader,{once:true});
}
function closeQRreader(){
  codeReader.reset();
  // window.removeEventListener('popstate',closeQRreader);
}
function onScanResult(result,err){
  if(result){
    document.getElementById(scanTarget).value=result.text;
    checkMissingAttendanceInfo();
    // closeQRreader();
    navigateBack();
  }
  // if(err && !(err instanceof ZXing.NotFoundException)){}
}
async function startQRreader(){
  codeReader.decodeFromStream(currentQRstream,"QRreaderVideo",onScanResult);
}
async function switchQRCamera(){
  currentQRstream=await switchCameraStream(currentQRstream);
  codeReader.reset();
  startQRreader();
}


//////////////// Photo /////////////////////////////

var selfieBlob=null,photoId=null,photoTakenTime=null;
const selfieCanvas=$('#selfieCanvas');
const selfieVideo=$('#selfieVideo');

async function enableSelfieCamera(){
  try{
    await startCamera(selfieVideo,200);
    window.addEventListener('popstate',stopCamera,{once:true});
    hide('defaultSelfieImg');
    hide(selfieCanvas);
    hide('addPhotoBtn');
    show(selfieVideo);
    show('snapPhotoBtn');
    show('switchPhotoBtn');
  }catch(err){
    selfiePhotoBtn.innerHTML='<span class="material-symbols-outlined">photo_camera</span> Retry taking selfie...';
    toastError('Unable to start camera.\nPlease make sure your camera permissions are enabled, reload, and try again.');
  }
}

async function snapPhoto(){
  hide(selfieVideo);
  hide('snapPhotoBtn');
  hide('switchPhotoBtn');
  show(selfieCanvas);
  show('addPhotoBtn');
  takePhoto(selfieVideo,selfieCanvas,200);
  selfieBlob=await canvasToBlob(selfieCanvas);
  photoTakenTime=new Date().getTime();
  checkMissingAttendanceInfo();
}


//////////////// Collect Attendance ////////////////

const getAttendanceClassCodeInput=$('#getAttendanceClassCodeInput');
const collectAttendanceBtn=$('#collectAttendanceBtn');
const minutesToCollectAttendance=$('#minutesToCollectAttendance');

async function showGetAttendance(sectionId){
  showInMain('getAttendance');
  if(!sectionId)sectionId=localStorage.takingAttendance;
  let section=await getSection(localStorage.semesterSelected,sectionId);
  $('#getAttendanceSectionId').innerText=sectionId;
  $('#getAttendanceCrossListIds').innerHTML=section.x?'<span>'+section.x.join('</span> <span>')+'</span>':'';
  $('#getAttendanceSectionInfo').innerText=section.pt+'\n'+section.r+'\n'+section.i.join('\n');
  // $('#getAttendanceSectionInfo').innerText+=
  $('#getAttendanceEditBtn').onclick=e=>{editSection(sectionId)};
  if(localStorage.attendanceCode){
    getAttendanceClassCodeInput.value=localStorage.attendanceCode;
  }else{
    randomAttendanceClassCodeClick();
  }
}

minutesToCollectAttendance.addEventListener('keydown',event=>{
  if(!event.target.getAttribute('contenteditable'))return;
  if(event.key==='ArrowDown'){
    let newval=(parseInt(event.target.innerText)||0)-1;
    if(newval>=1)event.target.innerText=newval+'.0';
  }else if(event.key==='ArrowUp'){
    event.target.innerText=(parseInt(event.target.innerText)||0)+1+'.0';
  }
})

function randomAttendanceClassCodeClick(){
  getAttendanceClassCodeInput.value=Math.random().toString().substring(2);
}

// function createQRClick(){
//   const qrCodeDiv=$("#QRcode");
//   const collectingAttendanceDiv=$('#collectingAttendanceDiv');
//   let code=getAttendanceClassCodeInput.value;
//   if(code!==qrCodeDiv.getAttribute('title')){
//     qrCodeDiv.innerHTML='';
//     new QRCode(qrCodeDiv, code);
//     qrCodeDiv.appendChild(document.createElement('div')).id="QRcodeTime";
//   }
//   showInMain('QRcode');
// }

const codeWriter = new ZXing.BrowserQRCodeSvgWriter();
function createQRClick(){
  const qrCodeDiv=$("#QRcode");
  const collectingAttendanceDiv=$('#collectingAttendanceDiv');
  let code=getAttendanceClassCodeInput.value;
  if(code!==qrCodeDiv.getAttribute('title')){
    qrCodeDiv.innerHTML='';
    codeWriter.writeToDom('#QRcode', code, 500, 500);
    qrCodeDiv.appendChild(document.createElement('div')).id="QRcodeTime";
  }
  showInMain('QRcode');
}

var attendanceTimer;
async function collectAttendanceBtnClick(){
  if(collectAttendanceBtn.innerText==='Start'){
    // check all fields are correctly filled
    if(!parseFloat(minutesToCollectAttendance.innerText) || parseFloat(minutesToCollectAttendance.innerText)<1){
      toast('Please enter a numeric value greater than or equal to 1 for the minutes attendance is to be collected.');
      return;
    }
    if(!getAttendanceClassCodeInput.value){
      toast('Please enter a passcode for taking attendance.');
      return;
    }
    loadingScreen(true);
    // save attendance info for section
    let sectionId=$('#getAttendanceSectionId').innerText;
    let section=await getSection(localStorage.semesterSelected,sectionId);
    section.a=md5(getAttendanceClassCodeInput.value).toUpperCase();
    section.e=db.now()+60*parseFloat(minutesToCollectAttendance.innerText);
    // update section in database
    let r=await db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+sectionId,{i:section.i,c:section.a,e:section.e});
    if(r.error){
      toastError('Cannot start taking attendance.\nWe are having issues writing to the database.\n'+r.error)
      loadingScreen(false);
      return;
    }
    if(section?.x?.length){
      for(let crossListId of section.x){
        r=await db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+crossListId,{s:localStorage.semesterSelected,id:crossListId,i:section.i,a:section.a,e:section.e});
        if(r.error){
          toastError('Cannot start taking attendance.\nWe are having issues writing to the database.\n'+r.error)
          loadingScreen(false);
          return;
        }
      }
    }
    // mark section as taking-attendance locally
    localStorage.minutesToCollectAttendance=minutesToCollectAttendance.innerText;
    localStorage.attendanceCode=getAttendanceClassCodeInput.value;
    localStorage.takingAttendance=sectionId;
    localStorage.attendanceEndtime=section.e;
    // update UI and start timer
    takingAttendance();
  }else{
    stopTakingAttendance();
  }
  loadingScreen(false);
}

function takingAttendance(){
  collectAttendanceBtn.innerText='Stop';
  getAttendanceClassCodeInput.setAttribute('disabled',true);
  $('#getAttendance .back').setAttribute('disabled',true);
  $('#collectingAttendance').innerText='Collecting';
  show('createQRCodeBtn');
  hide('randomAttendanceClassCodeBtn');
  minutesToCollectAttendance.removeAttribute('contenteditable');
  clearInterval(attendanceTimer);
  attendanceTimer=setInterval(updateAttendanceTime,1000);
}

function updateAttendanceTime(){
  let secondsLeftToEnd=parseInt(localStorage.attendanceEndtime)-db.now();
  if(secondsLeftToEnd<=0){
    stopTakingAttendance();
  }else{
    let minutes=Math.floor(secondsLeftToEnd/60);
    let seconds=secondsLeftToEnd-minutes*60;
    minutesToCollectAttendance.innerText=minutes+':'+pad0(seconds);
    let qrtime=$('#QRcodeTime');
    if(qrtime)qrtime.innerText=minutesToCollectAttendance.innerText;
  }
}

async function stopTakingAttendance(){
  showInMain('getAttendance');
  let sectionId=$('#getAttendanceSectionId').innerText;
  let section=await getSection(localStorage.semesterSelected,sectionId);
  // TODO: errorcheck
  db.updateOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+sectionId,{c:db.deleteField(),e:db.deleteField()});
  if(section?.x?.length){
    for(let crossListId of section.x){
      db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+crossListId,{c:db.deleteField(),e:db.deleteField()});
    }
  }
  clearInterval(attendanceTimer);
  collectAttendanceBtn.innerText='Start';
  getAttendanceClassCodeInput.removeAttribute('disabled');
  $('#getAttendance .back').removeAttribute('disabled');
  $('#collectingAttendance').innerText='Collect';
  hide('createQRCodeBtn');
  show('randomAttendanceClassCodeBtn');
  minutesToCollectAttendance.setAttribute('contenteditable','true');
  minutesToCollectAttendance.innerText=localStorage.minutesToCollectAttendance||'75.0';
  delete localStorage.takingAttendance;
  delete localStorage.attendanceCode;
  delete localStorage.attendanceEndtime;
}


//////////////// Attendance Record /////////////////

const attendancesDiv=$('#attendances');

async function attendanceToday(displayTable=true){
  await attendanceFiltered({d:getDateTime()[0]},displayTable);
}

async function attendanceHistory(displayTable=true){
  await attendanceFiltered(null,displayTable);
}

var attendanceTable;
const ATTEND_CODE_SEPARATOR=' : ';
const ATTEND_TABLE_DATA_COL_OFFSET=7;
const summaryCol=i=>i>2&&i<ATTEND_TABLE_DATA_COL_OFFSET;

async function attendanceFiltered(filter=attendanceTable?.filter,displayTable=true){
  let sectionId=$('#getAttendanceSectionId').innerText;
  let section=await getSection(localStorage.semesterSelected,sectionId);
  let sectionIds=[sectionId].concat(section.x||[]);
  let attendanceCodesAndTimes={};
  // get filtered data
  let filteredAttendances=await getAttendance(localStorage.semesterSelected,sectionIds,1,filter);
  // get sorted attend codes
  Object.values(filteredAttendances).map(usrDoc=>usrDoc.a).flat().forEach(attendDoc=>{
    let attendCodeDate=attendDoc.d+ATTEND_CODE_SEPARATOR+attendDoc.code;
    let dt1=attendanceCodesAndTimes[attendCodeDate];
    let dt2=attendDoc.d+' '+attendDoc.t;
    if((!dt1) || (new Date(dt1) > new Date(dt2))){
      attendanceCodesAndTimes[attendCodeDate]=dt2;
    }
  });
  attendanceCodesAndTimes=Object.entries(attendanceCodesAndTimes).sort((x,y)=>x[1]>y[1]?1:-1);
  // create table
  attendanceTable=[];
  attendanceTable.filter=filter;
  attendanceTable.semester=localStorage.semesterSelected;
  attendanceTable.id=sectionIds.join('|');
  if(filter?.d)attendanceTable.id+='--'+filter.d;
  attendanceTable.attendanceCodes=attendanceCodesAndTimes.map(x=>x[0]);
  attendanceTable.header=['Section','User','Name','Attendance-Grade','On-time','Late','Absent'].concat(attendanceCodesAndTimes.map(x=>x[1]));
  for(let user in filteredAttendances){
    let rec=attendanceTable.header.map(x=>'');
    rec._name=filteredAttendances[user].n;
    rec._photo=filteredAttendances[user].p;
    rec[0]=filteredAttendances[user].sid;
    rec[1]=user;
    rec[2]=filteredAttendances[user].n||user;
    rec[3]=0;
    rec[4]=0;
    rec[5]=0;
    rec[6]=0;
    for(let attendDoc of filteredAttendances[user].a){
      let i=attendanceTable.attendanceCodes.indexOf(attendDoc.d+ATTEND_CODE_SEPARATOR+attendDoc.code);
      if(rec[i+ATTEND_TABLE_DATA_COL_OFFSET]==='' || attendDoc.t<rec[i+ATTEND_TABLE_DATA_COL_OFFSET]){
        rec[i+ATTEND_TABLE_DATA_COL_OFFSET]=attendDoc.t;
      }
      rec._seat=attendDoc.s;
    }
    attendanceTable.push(rec);
  }
  var consideredLate=parseInt($('#minLateInput').value);
  if(!consideredLate || consideredLate<1){
    $('#minLateInput').value=consideredLate=20;
  }
  var pointsForLate=parseInt($('#pointsLateInput').value);
  if(!pointsForLate){
    $('#pointsLateInput').value=pointsForLate=20;
  }
  for(let rec of attendanceTable){
    for(let i=ATTEND_TABLE_DATA_COL_OFFSET;i<rec.length;i++){
      if(rec[i]){
        let dtStart=attendanceCodesAndTimes[i-ATTEND_TABLE_DATA_COL_OFFSET][1];
        let attendanceStart=new Date(dtStart);
        rec[i]=(new Date(dtStart.split(' ')[0]+' '+rec[i]) - attendanceStart)/60000;
        if(rec[i]>=consideredLate)rec[5]++;
        else rec[4]++;
      }else{
        rec[6]++;
      }
    }
    rec[3]=((rec[4]*100+rec[5]*pointsForLate)/(rec[4]+rec[5]+rec[6])).toFixed(1);
  }
  // display table
  if(displayTable){
    displayAttendanceTable();
    show('attendancesContainer');
    window.addEventListener('popstate',hideAttendanceRecord,{once:true});
  }
}

function hideAttendanceRecord(){
  hide('attendancesContainer');
}

function displayAttendanceTable(){
  attendancesDiv.innerHTML='';
  var consideredLate=parseInt($('#minLateInput').value);
  if(!consideredLate){
    $('#minLateInput').value=consideredLate=20;
  }
  for(let rec of [attendanceTable.header].concat(attendanceTable)){
    var row=attendancesDiv.appendChild(document.createElement('row'));
    for(let i=0;i<attendanceTable.header.length;i++){
      if(!attendanceTable.filter || !summaryCol(i)){
        var d=row.appendChild(document.createElement('div'));
        if(rec===attendanceTable.header){
          d.innerText=rec[i];
          d.title=attendanceTable.attendanceCodes[i-ATTEND_TABLE_DATA_COL_OFFSET];
          d.addEventListener('click',()=>sortAttendanceTable(i));
          d.classList.add('table-header');
        }else if(i>=ATTEND_TABLE_DATA_COL_OFFSET){
          d.innerText=rec[i]===''?'❌':(rec[i]<consideredLate?'✔️':'+'+rec[i]+'min');
          if(rec!==attendanceTable.header)d.style.overflowX='scroll';
        }else{
          d.innerText=rec[i];
        }
      }
    }
  }
  attendancesDiv.style.setProperty('--colNum',row.children.length);
}

var sortedFields=[];
function sortAttendanceTable(col){
  if(sortedFields[col]){
    var compare=(a,b)=>a.item[col]<b.item[col]?1:a.item[col]>b.item[col]?-1:a.index-b.index;
    sortedFields[col]=false;
  }else{
    var compare=(a,b)=>a.item[col]>b.item[col]?1:a.item[col]<b.item[col]?-1:a.index-b.index;
    sortedFields[col]=true;
  }
  let sortedTable=attendanceTable.map((item,index)=>({item, index}))
  .sort(compare)
  .map(a=>a.item);
  sortedTable.id=attendanceTable.id;
  sortedTable.filter=attendanceTable.filter;
  sortedTable.semester=attendanceTable.semester;
  sortedTable.header=attendanceTable.header;
  sortedTable.attendanceCodes=attendanceTable.attendanceCodes;
  attendanceTable=sortedTable;
  displayAttendanceTable();
}

function attendanceCSV(){
  let txt='';
  for(let rec of [attendanceTable.header].concat(attendanceTable)){
    for(let i=0;i<attendanceTable.header.length;i++){
      txt+=rec[i]+',';
    }
    txt+='\n';
  }
  return txt;
}

function downloadAttendanceRecord(){
  download('attendance-'+attendanceTable.id+'.csv',attendanceCSV());
}


////////////// Room Map ////////////////////////////

const roomMap=$('#roomMap');

async function showRoom(){
  // updated attendance table
  await attendanceToday(false);
  // create seat-student lookup table
  var seating={};
  for(let rec of attendanceTable){
    seating[rec._seat?.toLowerCase()?.trim()]=rec;
  }
  // clear map and recreate from room
  roomMap.innerHTML='';
  let section=await getSection(localStorage.semesterSelected,$('#getAttendanceSectionId').innerText);
  let room=await getRoomMap(section.r);
  roomMap._rows=room.length;
  roomMap._cols=0;
  for(let rowNum=0;rowNum<room.length;rowNum++){
    let row=room[rowNum];
    roomMap._cols=Math.max(roomMap._cols,row.length);
    let rowDiv=roomMap.appendChild(document.createElement('div'));
    for(let colNum=0;colNum<row.length;colNum++){
      let seatCode=room[rowNum][colNum];
      let seat=rowDiv.appendChild(document.createElement('div'));
      if(seatCode){
        seat.classList.add('seat');
        let student=seating[seatCode];
        if(student){
          seat.classList.add('taken');
          // seat.title=student._name;
          console.log(student._name,student._photo,await getLinkFromStoragePath(student._photo));
          seat.style.backgroundImage=`url("${await getLinkFromStoragePath(student._photo)||DEFAULT_USER_IMG}")`;
          seat.innerHTML=`<span>${student._name}</span>`;
          // seat.onmouseover=function(e){seat.style.transform='scale(2)';seat.style.overflow='visible';seat.style.zIndex=10;}
          // seat.onmouseout=function(e){seat.style.transform='';seat.style.overflow='hidden';seat.style.zIndex='';}
          // seat.onclick=function(e){seat.style.transform=seat.style.transform==='scale(6)'?'':'scale(6)';}
        }else{
          seat.innerText=seatCode;
        }
      }
    }
  }
  let zoom=parseFloat(localStorage.roomMapZoom)||1;
  roomMap.style.setProperty('--seat-width',25*zoom);
  roomMap.style.setProperty('--seat-height',25*zoom);
  $('#roomMapZoom').value=zoom;
  // display the room map
  showInMain('room');
}

function changeRoomMapSize(range){
  let value=parseFloat(range.value);
  range.title=(value*100).toFixed(0)+'%';
  roomMap.style.setProperty('--seat-width',25*value);
  roomMap.style.setProperty('--seat-height',25*value);
  localStorage.roomMapZoom=value;
}


/////////// Create/Edit Section ////////////////////

const CREATE_SECTION_BUTTON_TEXT = 'Create New Section';

async function deleteSection(semester,id){
  if(confirm('Are you sure you want to delete section '+id+' for '+semester+'?\n\nWARNING: All attendance data for this section and any cross-listed sections will be deleted.')){
    let r=await db.updateOne('sections',semester,null);
    //TODO: remove attendance data for this and cross-listed sections
    if(r.error){
      toastError('Cannot delete section.');
    }else{
      delete (await getSections(semester))[id];
      showEnrolledAndTeachingSections(semester);
      navigateBack();
    }
  }
}

$('#sectionSubmitBtn').addEventListener('click',async event=>{
  let creatingNewSection=$('#sectionSubmitBtn').innerText===CREATE_SECTION_BUTTON_TEXT;
  let semester=$('#sectionSemesterSelect').value;
  let id=$('#sectionIdInput').value;
  let sectionData={
    pt:$('#sectionPatternInput').value,
    r:$('#sectionRoomSelect').value,
    i:$('#sectionInstructorInput').value?.split('\n')?.map(txt=>txt.trim())?.filter(txt=>txt),
    x:$('#sectionCrosslistInput').value?.split('\n')?.map(txt=>txt.trim())?.filter(txt=>txt),
    rq:$('#sectionLocRequiredCheckbox').checked*REQUIRED_LOC |
    $('#sectionSeatRequiredCheckbox').checked*REQUIRED_SEAT |
    $('#sectionPhotoRequiredCheckbox').checked*REQUIRED_PHOTO
  };
  if(!semester){
    toast('Please select semester.','Missing information:',-1);
    return;
  }
  if(!id){
    toast('Please enter section id.','Missing information:',-1);
    return;
  }else if(creatingNewSection && await getSection(semester,id)){
    toast('Section '+id+' already exists.','Duplicate section id:',-1)
    return;
  }
  if(!sectionData.pt){
    toast('Please enter section day/time pattern.','Missing information:',-1);
    return;
  }
  if(!sectionData.r){
    toast('Please select a room.','Missing information:',-1);
    return;
  }
  if(!sectionData.i){
    toast('Please enter section instructor(s).','Missing information:',-1);
    return;
  }
  let sections=await getSections(semester);
  for(let sectionId in sections){
    if(sectionId!==id){
      let section=sections[sectionId];
      if(section.pt===sectionData.pt && section.r===sectionData.r){
        toast(section.r+' is booked at this time by section '+sectionId+'.\n\nIf these sections are cross-listed, please edit information for '+sectionId+' to indicate this, rather than creating a new section.','',-1);
        return;
      }
    }
  }
  // write section data to database
  let r=await db.updateOne('sections',semester,{[id]:sectionData});
  if(r.error){
    toastError('Failed to add section.\n\nPlease try again.')
  }else{
    // update section data in memory
    sections[id]=sectionData;
    // refresh shown sections
    if(semester===localStorage.semesterSelected){
      if(creatingNewSection)addSectionCard(id,sectionData,$('#instructorSections'));
      showEnrolledAndTeachingSections(localStorage.semesterSelected);
    }
    navigateBack();
  }
});

async function createNewSection(){
  $('#sectionSubmitBtn').innerText=CREATE_SECTION_BUTTON_TEXT;
  showInMain('addInstructorSection');
  // fill semester options
  let option;
  let sectionSemesterSelect=$('#sectionSemesterSelect');
  sectionSemesterSelect.removeAttribute('disabled');
  if(sectionSemesterSelect.children.length==1){
    let semesters = await getSemesters();
    for(let semester of semesters){
      option = sectionSemesterSelect.appendChild(document.createElement('option'));
      option.id = option.value = option.innerText = semester;
    }
  }
  // preselect current semester
  for(let option of sectionSemesterSelect.children){
    if(option.innerText==localStorage.semesterSelected){
      option.setAttribute('selected',true);
    }else{
      option.removeAttribute('selected');
    }
  }
  // fill room options
  let sectionRoomSelect=$('#sectionRoomSelect');
  if(sectionRoomSelect.children.length==1){
    let rooms = await getRooms();
    for(let room of rooms){
      option = sectionRoomSelect.appendChild(document.createElement('option'));
      option.id = option.value = room.id;
      option.innerText = room.bl + ' - ' + room.rn;
    }
  }
  // pre-fill instructor options
  if(!$('#sectionInstructorInput').value){
    $('#sectionInstructorInput').value=auth.currentUser.email;
  }
  // enable section id input
  $('#sectionIdInput').removeAttribute('disabled');
}

async function editSection(sectionId){
  $('#sectionSubmitBtn').innerText='Save Section';
  showInMain('addInstructorSection');
  let section=await getSection(localStorage.semesterSelected,sectionId);
  // fill semester options
  let option;
  let sectionSemesterSelect=$('#sectionSemesterSelect');
  sectionSemesterSelect.setAttribute('disabled',true);
  if(sectionSemesterSelect.children.length==1){
    let semesters = await getSemesters();
    for(let semester of semesters){
      option = sectionSemesterSelect.appendChild(document.createElement('option'));
      option.id = option.value = option.innerText = semester;
    }
  }
  // select current semester
  for(let option of sectionSemesterSelect.children){
    if(option.innerText==localStorage.semesterSelected){
      option.setAttribute('selected',true);
      sectionSemesterSelect.value=option.value;
    }else{
      option.removeAttribute('selected');
    }
  }
  // fill room options
  let sectionRoomSelect=$('#sectionRoomSelect');
  if(sectionRoomSelect.children.length==1){
    let rooms = await getRooms();
    for(let room of rooms){
      option = sectionRoomSelect.appendChild(document.createElement('option'));
      option.id = option.value = room.id;
      option.innerText = room.bl + ' - ' + room.rn;
    }
  }
  // select current room
  for(let option of sectionRoomSelect.children){
    if(option.value==section.r){
      option.setAttribute('selected',true);
      sectionRoomSelect.value=option.value;
    }else{
      option.removeAttribute('selected');
    }
  }
  // fill others options
  $('#sectionIdInput').setAttribute('disabled',true);
  $('#sectionIdInput').value=sectionId;
  $('#sectionPatternInput').value=section.pt;
  $('#sectionCrosslistInput').value=section?.x?.join('\n')||'';
  $('#sectionInstructorInput').value=section?.i?.join('\n')||'';
  $('#sectionLocRequiredCheckbox').checked=section.rq&REQUIRED_LOC;
  $('#sectionSeatRequiredCheckbox').checked=section.rq&REQUIRED_SEAT;
  $('#sectionPhotoRequiredCheckbox').checked=section.rq&REQUIRED_PHOTO;
}


//////////////// Section cards /////////////////////

function makeSectionCard(id,section,onclick,showCrossListed){
  var card=document.createElement('div');
  card._sectionDoc=section;
  card.id=id;
  card.className='sectionCard';
  if(section.a && section.e && section.e>db.now()){
    card.classList.add('acceptingAttendance');
  }
  var d=card.appendChild(document.createElement('div'));
  d.class='cardTitle';
  d.innerText=id;
  if(showCrossListed && section.x){
    d.innerText+='\n'+section.x.join('\n');
  }
  d=card.appendChild(document.createElement('div'));
  d.innerText=section.pt;
  d=card.appendChild(document.createElement('div'));
  d.innerText=section.r;
  section?.i?.forEach(i=>{
    d=card.appendChild(document.createElement('div'));
    d.innerText=i;
  })
  card.addEventListener('click',onclick);
  return card;
}

async function getAttendanceCardClick(event){
  showGetAttendance(event.currentTarget.id);
}

function markAttendanceCardClick(event){
  showMarkAttendance(event.currentTarget.id,event.currentTarget._sectionDoc);
}

async function addSectionToStudentClick(event){
  let sectionId=event.currentTarget.id, section=event.currentTarget._sectionDoc;
  let r=await db.updateOne('users',auth.currentUser.email,{[localStorage.semesterSelected+'.'+sectionId]:[]});
  if(r.error){
    toastError('Failed to add section.\n\nPlease try again.');
  }else{
    if(!userDoc[localStorage.semesterSelected])userDoc[localStorage.semesterSelected]=[];
    userDoc[localStorage.semesterSelected][sectionId]=[];
    addSectionCard(sectionId,section,$('#studentSections'),markAttendanceCardClick);
    navigateBack();
  }
}

function addSectionCard(id,section,container,onclick,showCrossListed){
  var card=makeSectionCard(id,section,onclick,showCrossListed);
  container.insertBefore(card,container.lastElementChild);
}

async function showAvailableStudentSections(){
  showInMain('selectStudentSection');
  var sections=await getSections(localStorage.semesterSelected);
  var sectionsContainer=$('#availableStudentSections');
  // remove old
  sectionsContainer.innerHTML='<span></span>';
  // add all available sections (sorted by id)
  let sectionIds=Object.keys(sections).sort();
  for(let id of sectionIds){
    let section=sections[id];
    if(!userDoc[localStorage.semesterSelected] || !Object.keys(userDoc[localStorage.semesterSelected])?.includes(id)){
      addSectionCard(id,section,sectionsContainer,addSectionToStudentClick);
    }
    if(section?.x?.length){
      for(let crossListId of section.x){
        if(crossListId && (!userDoc[localStorage.semesterSelected] || !Object.keys(userDoc[localStorage.semesterSelected])?.includes(crossListId))){
          addSectionCard(crossListId,section,sectionsContainer,addSectionToStudentClick);
        }
      }
    }
  }
  if(!sectionsContainer.innerText){
    sectionsContainer.appendChild(document.createElement('div')).innerText='No sections available.';
  }
}

async function showEnrolledAndTeachingSections(semester){
  var studentSections=$('#studentSections');
  var instructorSections=$('#instructorSections');
  if(!semester){
    hide(studentSections);
    hide(instructorSections);
    return;
  }
  show(studentSections);
  if(userDoc.rl&INSTRUCTOR){
    show(instructorSections);
  }
  var sections=await getSections(semester);
  // remove old (remove every card except the [+] card)
  for(let i=studentSections.childElementCount-1;i--;){
    studentSections.children[i].remove();
  }
  for(let i=instructorSections.childElementCount-1;i--;){
    instructorSections.children[i].remove();
  }
  // add sections
  for(let id of Object.keys(sections).sort()){
    let section=sections[id];
    // add student sections
    if(userDoc[semester] && Object.keys(userDoc[semester])?.includes(id)){
      addSectionCard(id,section,studentSections,markAttendanceCardClick);
    }
    if(section?.x?.length){
      for(let crossListId of section.x){
        if(userDoc[semester] && Object.keys(userDoc[semester])?.includes(crossListId)){
          addSectionCard(crossListId,section,studentSections,markAttendanceCardClick);
        }
      }
    }
    // add instructor sections
    if(!instructorSections.classList.contains('hidden') && section?.i?.includes(auth.currentUser.email)){
      addSectionCard(id,section,instructorSections,getAttendanceCardClick,true);
    }
  }
}

$('#semesterSelect').addEventListener('change',e=>{
  localStorage.semesterSelected=e.target.value;
  showEnrolledAndTeachingSections(e.target.value);
});


/////////// Name change functionality //////////////

const nameInput=$('#nameInput');
const saveNameBtn=$('#saveNameBtn');
nameInput.addEventListener('input',e=>{
  if(!nameInput.value || nameInput.lastValue===nameInput.value){
    hide(saveNameBtn);
  }else{
    show(saveNameBtn);
  }
});
saveNameBtn.addEventListener('click',async e=>{
  saveNameBtn.setAttribute('disabled','true');
  let r=await db.updateOne('users',auth.currentUser.email,{n:nameInput.value});
  if(r.error){
    toastError('Unable to update name.\n'+r.error);
  }else{
    hide(saveNameBtn);
    userDoc.n=nameInput.lastValue=nameInput.value;
    // $('#userDisplayName').innerText=userDoc.n=nameInput.lastValue=nameInput.value;
    toast('Name updated.','',1);
  }
  saveNameBtn.removeAttribute('disabled');
  allowNav();
})


///////////////// Toast ////////////////////////////

const toastDiv=$('#toast');
const toastMsg=$('#toastMessage');
function toast(msg,title,affect){
  if(affect){
    toastDiv.style.setProperty('--toast-accent',affect>0?'#4f6':'#f64')
  }
  toastMsg.innerHTML=title?title+'\n\n':'';
  if(typeof(msg)==='object'){
    for(let item in msg){
      if(msg[item])toastMsg.innerHTML+=item+' : '+msg[item]+'\n';
    }
  }else{
    toastMsg.innerHTML+=msg;
  }
  setTimeout(()=>{
    window.addEventListener('mousedown',closeToast);
    window.addEventListener('keydown',closeToast);
    window.addEventListener('popstate',closeToast);
    mainDiv.addEventListener('scroll',closeToast);
    show(toastDiv);
    toastDiv.classList.add('slide-up');
  },200);
}
function toastError(msg){
  toast(msg,'Error',-1);
}
function closeToast(){
  window.removeEventListener('mousedown',closeToast);
  window.removeEventListener('keydown',closeToast);
  window.removeEventListener('popstate',closeToast);
  mainDiv.removeEventListener('scroll',closeToast);
  hide(toastDiv);
  toastDiv.classList.remove('slide-up');
}


////////////// Accessibility Preferences /////////////

// dark mode
const themeToggle = $('#theme-switch');
function toggleDarkMode(){
  setTheme(themeToggle.innerText.startsWith('dark'));
}
function setTheme(dark){
  if(dark){
    localStorage.theme='dark';
    document.documentElement.setAttribute('theme', 'dark');
    themeToggle.innerText='light_mode';
  }else{
    delete localStorage.theme;
    document.documentElement.removeAttribute('theme');
    themeToggle.innerText='dark_mode';
  }
}
setTheme(localStorage.theme);

// font size
function changeFontSize(i){
  let newSize=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--main-font-size'))+i+'pt';
  localStorage.fontSize=newSize;
  document.documentElement.style.setProperty('--main-font-size',newSize);
}
if(localStorage.fontSize){
  document.documentElement.style.setProperty('--main-font-size',localStorage.fontSize);
}
