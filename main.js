'use strict'


//TODO:
//  add *required to all required fields (especially for marking attendance)
//  avoid collisions with reserved fields
//    make sure RESERVED_ATTEND_FIELDS can never collide with usernames
//      start them all with periods? make reserved ones in caps and lowercase usernames?
//    make sure SEMESTER_SECTION_SEPARATOR doesn't appear in semester or section titles


/////////////////// Constants //////////////////////

const SEMESTER_SECTION_SEPARATOR = '|';
const INSTRUCTOR=1, ADMIN=2;
const REQUIRED_LOC=1, REQUIRED_SEAT=2, REQUIRED_PHOTO=4;
const PHOTO_TIMEOUT=60000;
const RESERVED_ATTEND_FIELDS=['id','s','i','a','e','_a'];


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


///////////// Initialize and Sign in ///////////////

var userDoc;
window.addEventListener('load', async function(){
  // ensure clean path
  window.history.pushState(null,'LectureSeats',location.origin+this.location.pathname);
  // login functionality
  onAuth(async function(user){
    if(user){ // User is signed in
      //TODO: ensure only caldwell.edu users
      // if(!user.email.endsWith('@caldwell.edu')){
      //   ...
      // }
      localStorage.email=user.email;
      // hide sign-in button
      hide('firebaseui-auth-container');
      // display main, display user info
      show(mainDiv);
      show('user');
      $('#userDisplayName').innerText=user.displayName;
      $('#userPhoto').src=user.photoURL;
      userDoc=await db.findOne('users',user.email);
      // if this is a new user, update their record in the database
      if(userDoc?.error){
        toastError('Failed to search database.\n\n'+userDoc.error);
        return;
      }
      if(userDoc===null){
        userDoc={n:user.displayName};
        let r=await db.insertOne('users', userDoc, user.email);
        if(r.error){
          toastError('Could not add user to database.\n\n'+r.error.code);
          return;
        }
      }else if(!userDoc.n){
        let r=await db.updateOne('users', user.email, {n:user.displayName});
        if(r.error){
          toastError('Could not update name.\n\n'+r.error.code);
        }
      }else{
        $('#userDisplayName').innerText=userDoc.n;
      }
      // display user name
      nameInput.value=nameInput.lastValue=userDoc.n||user.displayName;
      // display instructor and admin options, depending on permissions
      if(userDoc.r&INSTRUCTOR || userDoc.r&ADMIN){
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
      show('firebaseui-auth-container');
      hide(mainDiv);
      hide('user');
      // let ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);
      // ui.start('#firebaseui-auth-container', {
      //   signInOptions: [
      //     firebase.auth.GoogleAuthProvider.PROVIDER_ID
      //   ],
      //   signInSuccessUrl:'#',
      // });
    }
  },
  error=>toastError('Authentication error.\n\n'+error)
  );
});

function signOut(){
  auth.signOut();
  googleAPIsignOut();
}


///////////////////// Navigation ///////////////////

const mainDiv = $('#main');
window.onhashchange=function(event){
  if(navAllowed){
    makeFirstElementChild(mainDiv,$(location.hash||'#sections'));
  }else if(location.hash!=='#_'){
    location.hash='#_';
  }
}
function showInMain(childOfMain){
  if(navAllowed)window.location.hash=childOfMain;
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

var navAllowed=true;
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
    navAllowed = false;
  }else{
    // $('fieldset').removeAttribute('disabled');
    hide('loading');
    navAllowed = true;
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
  return (await getRoom(roomId)).map.toLowerCase().split('\n').map(r=>r.split('\t'));
}

async function getAttendance(semester,sectionId,refresh,filter){
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
    }
  }
  if(filter && typeof(filter)==='object'){
    let filteredAttendances={};
    for(let user in allAttendances[attendId]){
      filteredAttendances[user]=allAttendances[attendId][user]
      .filter(attendDoc=>{
        for(let filterKey in filter){
          if(attendDoc[filterKey]!==filter[filterKey])return false;
        }
        return true;
      });
    }
    return filteredAttendances;
  }
  return allAttendances[attendId];
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
  $('#selfieImg').src=getLinkFromFileId(userDoc.img)||auth.currentUser.photoURL||'user512.png';
  showMarkedAttendances(section);
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
      show('markAttendanceLocationOff');
    }else{
      markAttendanceLocation.value=r;
      show(markAttendanceLocation);
      hide('markAttendanceLocationOff');
    }
    if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_LOC && r.error){
      markAttendanceRequirementsList.appendChild(document.createElement('li')).innerText='Location';
    }
  }
  // check seat code, if required
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_SEAT){
    $('label[for="markAttendanceSeatCodeInput"]').classList.add('required');
  }else{
    $('label[for="markAttendanceSeatCodeInput"]').classList.remove('required');
  }
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_SEAT && !(await validateSeat($('#markAttendanceSeatCodeInput').value,markAttendanceSectionId._sectionDoc.room))){
    markAttendanceRequirementsList.appendChild(document.createElement('li')).innerText='Valid seat code';
  }
  // check photo, if required
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_PHOTO){
    $('label[for="selfieImg"]').classList.add('required');
  }else{
    $('label[for="selfieImg"]').classList.remove('required');
  }
  let validPhoto=photoId && photoTakenTime && (new Date().getTime()-photoTakenTime)<PHOTO_TIMEOUT;
  if(markAttendanceSectionId._sectionDoc.rq&REQUIRED_PHOTO && !validPhoto){
    selfieImg.src='user512.png';
    markAttendanceRequirementsList.appendChild(document.createElement('li')).innerText='New photo';
  }else if(validPhoto){
    selfieImg.src=getLinkFromFileId(photoId);
  }
  // if any info is missing, display this and disable Mark Attendance button
  if(markAttendanceRequirementsList.innerHTML){
    $('#markAttendanceButton').setAttribute('disabled',true);
    show('markAttendanceRequirements');
  }else{
    $('#markAttendanceButton').removeAttribute('disabled');
    hide('markAttendanceRequirements');
  }
}

function showMarkedAttendances(section){
  let attendanceMarkedDiv=$('#attendanceMarked');
  if(section.attended?.length){
    attendanceMarkedDiv.innerHTML='Attendance marked:';
    for(let attended of section.attended){
      let d=attendanceMarkedDiv.appendChild(document.createElement('div'));
      d.innerText=attended[1];
      if(!attended[0])d.setAttribute('failed',true);
    }
    mainDiv.scrollTop=0;
  }else{
    attendanceMarkedDiv.innerHTML='';
  }
}

$('#markAttendanceRemoveButton').addEventListener('click',async e=>{
  if(confirm('Are you sure you would like to remove this section from the list of sections you are enrolled in?')){
    let sectionId=markAttendanceSectionId.innerText;
    let r=await db.updateOne('users',auth.currentUser.email,{[localStorage.semesterSelected]:db.arrayRemove(sectionId)});
    if(r.error){
      toastError('Something went wrong. Please try again.');
    }else{
      userDoc[localStorage.semesterSelected]=userDoc[localStorage.semesterSelected].filter(e=>e!==sectionId);
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
    // collect all info
    loadingScreen(true);
    let semesterSectionId=localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+markAttendanceSectionId.innerText;
    let section=markAttendanceSectionId._sectionDoc;
    let code=markAttendanceClassCodeInput.value;
    let seat=$('#markAttendanceSeatCodeInput').value;
    let loc=markAttendanceLocation.value;
    if(loc)loc=[loc.latitude,loc.longitude,loc.accuracy];
    let currentDT=getDateTime();
    if(!section.attended)section.attended=[];
    // try to mark attendance, then display success or fail messages
    if(await markAttendance(semesterSectionId,code,seat,photoId,loc,currentDT[0],currentDT[1])){
      loadingScreen(false);
      section.attended.push([1,new Date().toLocaleString(undefined,{timeZoneName:'short'})]);
      showMarkAttendance(markAttendanceSectionId.innerText,section);
      toast('Your attendance was marked.','Success!',1);
    }else{
      loadingScreen(false);
      section.attended.push([0,new Date().toLocaleString(undefined,{timeZoneName:'short'})]);
      showMarkedAttendances(section);
      toast('Please make sure the instructor is taking attendance, and that your attendance passcode is correct.','Your attendance was NOT marked.',-1);
    }
  }else{
    toast('Missing some of the required fields.','',-1);
  }
}

async function markAttendance(semesterSectionId,code,seat,photo,loc,date,time){
  let user=auth.currentUser.email.split('@')[0].replaceAll('.','_');
  let data={n:userDoc.n,d:date,t:time,a:code};
  if(seat)data.s=seat;
  if(loc)data.l=loc;
  if(photo)data.p=photo;
  let r=await db.updateOne('attend',semesterSectionId,{'_a':code, [user]:db.arrayUnion(data)});
  return !r.error;
}

function openQRreader(target){
  showInMain('QRreader');
  var html5QrcodeScanner = new Html5QrcodeScanner("QRreaderVideo", {fps:10,qrbox:250});
  html5QrcodeScanner.render(onScanSuccess);
  function closeQRreader(){
    html5QrcodeScanner.clear();
    window.removeEventListener('popstate',closeQRreader);
  }
  window.addEventListener('popstate',closeQRreader);
  function onScanSuccess(decodedText,decodedResult){
    document.getElementById(target).value=decodedText;
    closeQRreader();
    navigateBack();
  }
}


//////////////// Photo /////////////////////////////

var selfieBlob=null,photoId=null,photoTakenTime=null;
const selfiePhotoBtn=$('#snapPhotoBtn');
const selfieCanvas=$('#selfieCanvas');
const selfieVideo=$('#selfieVideo');
const RETAKE_BTN_TXT='Retake Selfie';

function showTakeSelfieScreen(){
  showInMain('takeSelfie');
  photoClick();
}



async function photoClick(event){
  if(!event || selfiePhotoBtn.innerText.includes(RETAKE_BTN_TXT)){
    selfiePhotoBtn.innerHTML='<span class="material-symbols-outlined">camera</span> Snap Photo';
    hide(selfieCanvas);
    show(selfieVideo);
    $('#saveSelfieBtn').setAttribute('disabled',true);
    try{
      await startCamera(selfieVideo,200);
      window.addEventListener('popstate',stopCamera,{once:true});
    }catch(err){
      selfiePhotoBtn.innerHTML='<span class="material-symbols-outlined">photo_camera</span> Retry taking selfie...';
      toastError('Unable to start camera.\nPlease make sure your camera permissions are enabled, reload, and try again.');
    }
  }else{
    selfiePhotoBtn.innerHTML='<span class="material-symbols-outlined">photo_camera</span> '+RETAKE_BTN_TXT;
    hide(selfieVideo);
    show(selfieCanvas);
    $('#saveSelfieBtn').removeAttribute('disabled');
    takePhoto(selfieVideo,selfieCanvas,200);
    selfieBlob=await canvasToBlob(selfieCanvas);
    window.addEventListener('popstate',warnAboutUnsavedPhoto,{once:true});
  }
}
selfiePhotoBtn.onclick=selfieVideo.onclick=selfieCanvas.onclick=photoClick;

function warnAboutUnsavedPhoto(){
  if(selfieBlob && !photoId)
  toast('Your photo was not saved.','Warning',-1);
}

async function savePhoto(){
  loadingScreen(true);
  if(selfieBlob){
    if(!await verifyAuthToken()){
      let r=await signInToGoogleAPI();
      if(r?.error){
        loadingScreen(false);
        toastError(r.error+'\n\nPlease make sure your popups are enabled and try again.');
        return;
      }
    }
    try{
      let folderId=await getFolderId(localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+markAttendanceSectionId.innerText,markAttendanceSectionId._sectionDoc.i);
      photoId=await uploadFile('selfie-'+getDateTime().join('-').replace(':','-')+'.jpg',selfieBlob,folderId);
      photoTakenTime=new Date().getTime();
      checkMissingAttendanceInfo();
      loadingScreen(false);
      navigateBack();
      toast('Photo saved.','',1);
    }catch(e){
      googleAPIsignOut();
      loadingScreen(false);
      toast(e.message+'\n\nPlease try again.\nMake sure you allow access to Google Drive when logging in.','Could not upload photo to Google Drive',-1);
    }
  }
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
  $('#getAttendanceSectionInfo').innerText=section.pattern+'\n'+section.room+'\n'+section.i.join('\n');
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

function createQRClick(){
  const qrCodeDiv=$("#QRcode");
  const collectingAttendanceDiv=$('#collectingAttendanceDiv');
  let code=getAttendanceClassCodeInput.value;
  if(code!==qrCodeDiv.getAttribute('title')){
    qrCodeDiv.innerHTML='';
    new QRCode(qrCodeDiv, code);
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
    let r=await db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+sectionId,{s:localStorage.semesterSelected,id:sectionId,i:section.i,a:section.a,e:section.e});
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
  db.updateOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+sectionId,{a:db.deleteField(),e:db.deleteField()});
  if(section?.x?.length){
    for(let crossListId of section.x){
      db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+crossListId,{a:db.deleteField(),e:db.deleteField()});
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

async function attendanceToday(){
  await attendanceFiltered({d:getDateTime()[0]});
}

async function attendanceHistory(){
  await attendanceFiltered();
}

var attendanceTable;
const ATTEND_CODE_SEPARATOR=' : ';
const ATTEND_TABLE_DATA_COL_OFFSET=6;

async function attendanceFiltered(filter){
  let sectionId=$('#getAttendanceSectionId').innerText;
  let section=await getSection(localStorage.semesterSelected,sectionId);
  let sectionIds=[sectionId].concat(section.x||[]);
  let filteredAttendances={},attendanceCodesAndTimes={};
  // get filtered data
  for(let sid of sectionIds){
    filteredAttendances[sid]=await getAttendance(localStorage.semesterSelected,sid,1,filter);
    Object.values(filteredAttendances[sid]).flat().forEach(attendDoc=>{
      let attendCode=attendDoc.d+ATTEND_CODE_SEPARATOR+attendDoc.a;
      let dt1=attendanceCodesAndTimes[attendCode];
      let dt2=attendDoc.d+' '+attendDoc.t;
      if((!dt1) || (new Date(dt1) > new Date(dt2))){
        attendanceCodesAndTimes[attendCode]=dt2;
      }
    })
  }
  // sort attendance codes by datetime
  attendanceCodesAndTimes=Object.entries(attendanceCodesAndTimes).sort((x,y)=>x[1]>y[1]?1:-1);
  // create table
  attendanceTable=[];
  attendanceTable.filter=filter;
  attendanceTable.semester=localStorage.semesterSelected;
  attendanceTable.id=sectionIds.join('|');
  if(filter?.d)attendanceTable.id+='-'+filter.d;
  attendanceTable.attendanceCodes=attendanceCodesAndTimes.map(x=>x[0]);
  attendanceTable.header=['Section','User','Name','On-time','Late','Absent'].concat(attendanceCodesAndTimes.map(x=>x[1]));
  for(let sid of sectionIds){
    for(let user in filteredAttendances[sid]){
      let rec=attendanceTable.header.map(x=>'');
      rec[0]=sid;
      rec[1]=user;
      rec[2]=user;
      rec[3]=0;
      rec[4]=0;
      rec[5]=0;
      for(let attendDoc of filteredAttendances[sid][user]){
        let i=attendanceTable.attendanceCodes.indexOf(attendDoc.d+ATTEND_CODE_SEPARATOR+attendDoc.a);
        if(rec[i+ATTEND_TABLE_DATA_COL_OFFSET]==='' || attendDoc.t<rec[i+ATTEND_TABLE_DATA_COL_OFFSET]){
          rec[i+ATTEND_TABLE_DATA_COL_OFFSET]=attendDoc.t;
        }
        rec._attendDoc=attendDoc;
        if(attendDoc.n)rec[2]=attendDoc.n;
      }
      attendanceTable.push(rec);
    }
  }
  for(let rec of attendanceTable){
    for(let i=ATTEND_TABLE_DATA_COL_OFFSET;i<rec.length;i++){
      if(rec[i]){
        let dtStart=attendanceCodesAndTimes[i-ATTEND_TABLE_DATA_COL_OFFSET][1];
        let attendanceStart=new Date(dtStart);
        rec[i]=(new Date(dtStart.split(' ')[0]+' '+rec[i]) - attendanceStart)/60000;
        if(rec[i]>5)rec[4]++;
        else rec[3]++;
      }else{
        rec[5]++;
      }
    }
  }
  // display table
  displayAttendanceTable();
  show('attendancesContainer');
  window.addEventListener('popstate',hideAttendanceRecord,{once:true});
}

function hideAttendanceRecord(){
  hide('attendancesContainer');
}

function displayAttendanceTable(){
  attendancesDiv.innerHTML='';
  for(let rec of [attendanceTable.header].concat(attendanceTable)){
    for(let i=0;i<attendanceTable.header.length;i++){
      var d=attendancesDiv.appendChild(document.createElement('div'));
      if(rec===attendanceTable.header){
        d.innerText=rec[i];
        d.addEventListener('click',()=>sortAttendanceTable(i));
        d.classList.add('table-header');
      }else if(i>=ATTEND_TABLE_DATA_COL_OFFSET){
        d.innerText=rec[i]===''?'❌':(rec[i]<5?'✔️':'+'+rec[i]+'min');
        d.title=attendanceTable.attendanceCodes[i-ATTEND_TABLE_DATA_COL_OFFSET];
        if(rec!==attendanceTable.header)d.style.overflowX='scroll';
      }else{
        d.innerText=rec[i];
      }

    }
  }
  attendancesDiv.style.setProperty('--colNum',attendanceTable.header.length);
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
  await attendanceToday();
  // create seat-student lookup table
  var seating={};
  for(let rec of attendanceTable){
    seating[rec._attendDoc?.s?.toLowerCase()?.trim()]=rec._attendDoc;
  }
  // clear map and recreate from room
  roomMap.innerHTML='';
  let section=await getSection(localStorage.semesterSelected,$('#getAttendanceSectionId').innerText);
  let room=await getRoomMap(section.room);
  roomMap._rows=room.length;
  roomMap._cols=0;
  for(let rowNum=0;rowNum<room.length;rowNum++){
    let row=room[rowNum];
    roomMap._cols=Math.max(roomMap._cols,row.length);
    for(let colNum=0;colNum<row.length;colNum++){
      let seatCode=room[rowNum][colNum];
      if(seatCode){
        let seat=roomMap.appendChild(document.createElement('div'));
        seat.style.gridRow=rowNum+1;
        seat.style.gridColumn=colNum+1;
        let student=seating[seatCode];
        if(student){
          seat.title=student.n;
          seat.style.backgroundImage=`url("${getLinkFromFileId(student.p)||'user512.png'}")`;
          seat.innerHTML=`<span>${student.n}</span>`;
          seat.onmouseover=function(e){seat.style.transform='scale(2)';seat.style.overflow='visible';seat.style.zIndex=10;}
          seat.onmouseout=function(e){seat.style.transform='';seat.style.overflow='hidden';seat.style.zIndex='';}
          seat.onclick=function(e){seat.style.transform=seat.style.transform==='scale(6)'?'':'scale(6)';}
        }else{
          seat.innerText=seatCode;
        }
      }
    }
  }
  let zoom=parseFloat(localStorage.roomMapZoom)||1;
  roomMap.style.width=roomMap._cols*25*zoom;
  roomMap.style.height=roomMap._rows*25*zoom;
  $('#roomMapZoom').value=zoom;
  // display the room map
  showInMain('room');
}

function changeRoomMapSize(range){
  let value=parseFloat(range.value);
  range.title=(value*100).toFixed(0)+'%';
  roomMap.style.width=roomMap._cols*25*value;
  roomMap.style.height=roomMap._rows*25*value;
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
    pattern:$('#sectionPatternInput').value,
    room:$('#sectionRoomSelect').value,
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
  if(!sectionData.pattern){
    toast('Please enter section day/time pattern.','Missing information:',-1);
    return;
  }
  if(!sectionData.room){
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
      if(section.pattern===sectionData.pattern && section.room===sectionData.room){
        toast(section.room+' is booked at this time by section '+sectionId+'.\n\nIf these sections are cross-listed, please edit information for '+sectionId+' to indicate this, rather than creating a new section.','',-1);
        return;
      }
    }
  }
  let r=await db.updateOne('sections',semester,{[id]:sectionData});
  if(r.error){
    toastError('Failed to add section.\n\nPlease try again.')
  }else{
    sections[id]=sectionData;
    if(creatingNewSection)addSectionCard(id,sectionData,$('#instructorSections'));
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
      option.innerText = room.building + ' - ' + room.room;
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
      option.innerText = room.building + ' - ' + room.room;
      if(room.id==section.room){
        option.setAttribute('selected',true);
      }
    }
  }
  // fill others options
  $('#sectionIdInput').setAttribute('disabled',true);
  $('#sectionIdInput').value=sectionId;
  $('#sectionPatternInput').value=section.pattern;
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
  d.innerText=section.pattern;
  d=card.appendChild(document.createElement('div'));
  d.innerText=section.room;
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
  let r=await db.updateOne('users',auth.currentUser.email,{[localStorage.semesterSelected]:db.arrayUnion(sectionId)});
  if(r.error){
    toastError('Failed to add section.\n\nPlease try again.');
  }else{
    if(!userDoc[localStorage.semesterSelected])userDoc[localStorage.semesterSelected]=[];
    userDoc[localStorage.semesterSelected].push(sectionId);
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
  sectionsContainer.innerHTML='';
  // add all available sections
  for(let id in sections){
    let section=sections[id];
    if(!userDoc[localStorage.semesterSelected]?.includes(id)){
      addSectionCard(id,section,sectionsContainer,addSectionToStudentClick);
    }
    if(section?.x?.length){
      for(let crossListId of section.x){
        if(crossListId && !userDoc[localStorage.semesterSelected]?.includes(crossListId)){
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
  if(userDoc.r&INSTRUCTOR){
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
    if(userDoc[semester]?.includes(id)){
      addSectionCard(id,section,studentSections,markAttendanceCardClick);
    }
    if(section?.x?.length){
      for(let crossListId of section.x){
        if(userDoc[semester]?.includes(crossListId)){
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
  if(nameInput.lastValue!==nameInput.value){
    show(saveNameBtn);
  }else{
    hide(saveNameBtn);
  }
});
saveNameBtn.addEventListener('click',async e=>{
  saveNameBtn.setAttribute('disabled','true');
  let r=await db.updateOne('users',auth.currentUser.email,{n:nameInput.value});
  if(!r.error){
    hide(saveNameBtn);
    $('#userDisplayName').innerText=userDoc.n=nameInput.lastValue=nameInput.value;
  }
  saveNameBtn.removeAttribute('disabled');
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
