'use strict'


/////////////////// Constants //////////////////////

const SEMESTER_SECTION_SEPARATOR = '|'; //TODO: ensure this string doesn't appear in semester or section name
const INSTRUCTOR=1, ADMIN=2;


////////////// Helper functions ////////////////////

const $ = document.querySelector.bind(document);

function makeFirstElementChild(parent, child){
  if(parent.firstElementChild!==child){
    parent.insertBefore(child,parent.firstElementChild);
  }
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

function getLocation(){
  return new Promise(function(resolve, reject) {
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
}


///////////// Initialize and Sign in ///////////////

var userDoc;
window.addEventListener('load', async function(){
  // ensure clean path
  window.history.pushState(null,'LectureSeats',location.origin+this.location.pathname);
  // login functionality
  onAuth(async function(user){
    // console.log('checking auth',user)
    toast(user,'checking auth');
    if(user){ // User is signed in
      //TODO: ensure only caldwell.edu users
      // if(!user.email.endsWith('@caldwell.edu')){
      //   ...
      // }
      localStorage.email=user.email;
      // hide sign-in button
      $('#firebaseui-auth-container').classList.add('hidden');
      // check if user is signed in to google API, as well
      // await initGoogleAPI();
      // if(await verifyAuthToken()){
      //   mainDiv.classList.remove('hidden');
      // }else{
      //   $('#enableGoogleDriveDiv').classList.remove('hidden');
      // }
      // display main, display user info
      mainDiv.classList.remove('hidden');
      $('#user').classList.remove('hidden');
      $('#userDisplayName').innerText=user.displayName;
      $('#userPhoto').src=user.photoURL;
      userDoc=await db.findOne('users',user.email);
      // if this is a new user, update their record in the database
      if(userDoc?.error){
        alert('Something went wrong.');
        return;
      }
      if(userDoc===null){
        userDoc={n:user.displayName};
        let r=await db.insertOne('users', userDoc, user.email);
        if(r.error){
          toast(r.error.code,'Error')
          return;
        }
      }else if(!userDoc.n){
        let r=await db.updateOne('users', user.email, {n:user.displayName});
        if(r.error){
          toast(r.error.code,'Error')
        }
      }
      // display user name
      nameInput.value=nameInput.lastValue=userDoc.n||user.displayName;
      // display instructor and admin options, depending on permissions
      if(userDoc.r&INSTRUCTOR){
        // $('#instructorSections').classList.remove('hidden');
        $('#roomsBtn').classList.remove('hidden');
        $('#allSectionsBtn').classList.remove('hidden');
      }
      if(userDoc.r&ADMIN){
        $('#roomsBtn').classList.remove('hidden');
        $('#allSectionsBtn').classList.remove('hidden');
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
        $('#minutesToCollectAttendance').innerText=localStorage.minutesToCollectAttendance;
      }
      // if in the middle of taking attendance, go to attendance-taking section
      if(localStorage.takingAttendance && parseInt(localStorage.attendanceEndtime)>db.now()){
        showGetAttendance();
        takingAttendance();
      }
    }else{
      // User is signed out: Display sign-in button, hide main
      $('#firebaseui-auth-container').classList.remove('hidden');
      mainDiv.classList.add('hidden');
      $('#user').classList.add('hidden');
      // let ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);
      // ui.start('#firebaseui-auth-container', {
      //   signInOptions: [
      //     firebase.auth.GoogleAuthProvider.PROVIDER_ID
      //   ],
      //   signInSuccessUrl:'#',
      // });
    }
  },
  error=>toast(error,'Error: '+error)
  );
});

function signOut(){
  auth.signOut();
  googleAPIsignOut();
}

function toast(msg,title){
  let toastMessage=$('#toastMessage');
  toastMessage.innerHTML=title?title+'\n\n':'';
  if(typeof(msg)==='object'){
    for(let item in msg){
      if(msg[item])toastMessage.innerHTML+=item+' : '+msg[item]+'\n';
    }
  }else{
    toastMessage.innerHTML+=msg;
  }
  $('#toast').classList.remove('hidden');
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
  if(navAllowed)
    window.location.hash=childOfMain;
}
function navigateBack(){
  if(navAllowed)
    history.back();
}

var navAllowed=true;
// ensure we don't navigate away from taking attendance until it's stopped
window.addEventListener('popstate',event=>{
  if(location.hash!=='#getAttendance' && location.hash!=='#QRcode' && localStorage.takingAttendance && parseInt(localStorage.attendanceEndtime)>db.now()){
    showGetAttendance();
    takingAttendance();
  }
})

function loadingScreen(on){
  if(on){
    $('fieldset').setAttribute('disabled',true);
    $('#loading').classList.remove('hidden');
    navAllowed = false;
  }else{
    $('fieldset').removeAttribute('disabled');
    $('#loading').classList.add('hidden');
    navAllowed = true;
  }
}

//////////// Get semesters, sections, rooms ////////

var allSections={},allRooms=[],allSemesters=['2023Fall','2024Winter','2024Spring'];

async function getSemesters(){
  return ['2023Fall','2024Winter','2024Spring'];
}

async function getSections(semester){
  if(semester && !allSections[semester]){
    allSections[semester]=await db.findOne('sections',semester);
    if(allSections[semester].error){
      alert('Something went wrong. Try to reload.');
      return;
    }else if(allSections[semester]===null){
      allSections[semester]={};
    }
  }
  return allSections[semester];
}

async function getSection(semester,sectionId){
  let sections=await getSections(semester);
  if(sections)return sections[sectionId];
}

async function getRooms(semester){
  if(!allRooms?.length){
    allRooms=await db.find('rooms');
  }
  return allRooms;
}


//////////////// Mark Attendance ///////////////////

function showMarkAttendance(sectionId,section){
  showInMain('markAttendance');
  $('#markAttendanceSectionId').innerText=sectionId;
  $('#markAttendanceSectionId')._sectionDoc=section;
  $('#markAttendanceClassCodeInput').value='';
  $('#markAttendanceSeatCodeInput').value='';
  $('#selfieUndo').click();
  showMarkedAttendances(section);
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
    let sectionId=$('#markAttendanceSectionId').innerText;
    let r=await db.updateOne('users',auth.currentUser.email,{[localStorage.semesterSelected]:db.arrayRemove(sectionId)});
    if(r.error){
      alert('Something went wrong. Please try again.');
    }else{
      userDoc[localStorage.semesterSelected]=userDoc[localStorage.semesterSelected].filter(e=>e!==sectionId);
      showEnrolledAndTeachingSections(localStorage.semesterSelected);
      navigateBack();
    }
  }
});

$('#markAttendanceButton').addEventListener('click',checkInfoAndMarkAttendance);

async function checkInfoAndMarkAttendance(){
  //TODO: check seat/photo, warn user
  let code=$('#markAttendanceClassCodeInput').value;
  if(code){
    loadingScreen(true);
    let markAttendanceIdDiv=$('#markAttendanceSectionId');
    let semesterSectionId=localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+markAttendanceIdDiv.innerText;
    let section=markAttendanceIdDiv._sectionDoc;
    let seat=$('#markAttendanceSeatCodeInput').value;
    let photoId=null;
    let currentDT=getDateTime();
    if(selfieBlob){
      if(!await verifyAuthToken())await signInToGoogleAPI();
      let folderId=await getFolderId(semesterSectionId,section.i);
      photoId=await uploadFile('selfie-'+currentDT.join('-').replace(':','-')+'.jpg',selfieBlob,folderId);
    }
    if(await markAttendance(semesterSectionId,code,seat,photoId,currentDT[0],currentDT[1])){
      loadingScreen(false);
      alert('Your attendance was marked.')
      if(!section.attended)section.attended=[];
      section.attended.push([1,new Date().toLocaleString(undefined,{timeZoneName:'short'})]);
      showMarkAttendance(markAttendanceIdDiv.innerText,section);
    }else{
      loadingScreen(false);
      alert('ERROR: Your attendance was NOT marked.\n\nPlease make sure the instructor is taking attendance, and that your attendance passcode is correct.');
      console.log('here')
      if(!section.attended)section.attended=[];
      section.attended.push([0,new Date().toLocaleString(undefined,{timeZoneName:'short'})]);
      showMarkedAttendances(section);
      
    }
  }else{
    alert('Please enter a valid attendance passcode.')
  }
}

async function markAttendance(semesterSectionId,code,seat,photo,date,time){
  let user=auth.currentUser.email.split('@')[0].replaceAll('.','_');
  let loc=await getLocation();
  let data={'_a': code, [user]: db.arrayUnion({
    d:date,
    t:time,
    a:code,
    s:seat,
    l:loc.coords.latitude+','+loc.coords.longitude,//TODO: add precision
    p:photo
  }) };
  let r=await db.updateOne('attend', semesterSectionId, data);
  return !r.error;
}

function openQRreader(target){
  showInMain('QRreader');
  var html5QrcodeScanner = new Html5QrcodeScanner("QRreaderVideo", {fps:10,qrbox:250});
  html5QrcodeScanner.render(onScanSuccess);
  function closeQRreader(){
    html5QrcodeScanner.clear();
    navigateBack();
    $('#QRReaderBackButton').removeEventListener('click',closeQRreader);
  }
  $('#QRReaderBackButton').addEventListener('click',closeQRreader);
  // $('#html5-qrcode-button-camera-stop').addEventListener('click',closeQRreader);
  function onScanSuccess(decodedText,decodedResult){
    document.getElementById(target).value=decodedText;
    closeQRreader();
  }
}
function markAttendanceQRcodeButtonClick(event){
  openQRreader('markAttendanceClassCodeInput');
}
function markAttendanceQRseatButtonClick(event){
  openQRreader('markAttendanceSeatCodeInput');
}

var selfieBlob=null;
$('#takeSelfieStartVideoBtn').addEventListener('click',event=>{
  event.currentTarget.classList.add('hidden');
  $('#selfieImg').classList.add('hidden');
  $('#selfieCanvas').classList.add('hidden');
  $('#selfieUndo').classList.add('hidden');
  $('#selfieVideo').classList.remove('hidden');
  $('#takeSelfieBtn').classList.remove('hidden');
  startCamera($('#selfieVideo'),200);
});
$('#takeSelfieBtn').addEventListener('click',async event=>{
  event.currentTarget.classList.add('hidden');
  $('#selfieImg').classList.add('hidden');
  $('#selfieVideo').classList.add('hidden');
  $('#selfieCanvas').classList.remove('hidden');
  $('#selfieUndo').classList.remove('hidden');
  $('#takeSelfieStartVideoBtn').classList.remove('hidden');
  selfieBlob=await takePhoto($('#selfieVideo'),$('#selfieCanvas'),200);
});
$('#selfieUndo').addEventListener('click',event=>{
  stopCamera();
  event.currentTarget.classList.add('hidden');
  $('#selfieImg').classList.remove('hidden');
  $('#selfieVideo').classList.add('hidden');
  $('#selfieCanvas').classList.add('hidden');
  $('#takeSelfieBtn').classList.add('hidden');
  $('#takeSelfieStartVideoBtn').classList.remove('hidden');
  selfieBlob=null;
});


//////////////// Collect Attendance ////////////////

const getAttendanceClassCodeInput=$('#getAttendanceClassCodeInput');
const collectAttendanceBtn=$('#collectAttendanceBtn');

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

$('#minutesToCollectAttendance').addEventListener('keydown',event=>{
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
  // $('#createQRCodeBtn').classList.add('hidden');
  // $('#saveAttendanceClassCodeBtn').classList.remove('hidden');
}

function createQRClick(){
  let code=getAttendanceClassCodeInput.value;
  if(code!==$("#QRcode").getAttribute('title')){
    $("#QRcode").innerHTML='';
    new QRCode($("#QRcode"), code);
  }
  showInMain('QRcode');
}

var attendanceTimer;
async function collectAttendanceBtnClick(){
  if(collectAttendanceBtn.innerText==='Start'){
    // check all fields are correctly filled
    if(!parseFloat($('#minutesToCollectAttendance').innerText) || parseFloat($('#minutesToCollectAttendance').innerText)<1){
      alert('Please enter a numeric value greater than 1 for minutes attendance is to be collected.')
      return;
    }
    if(!getAttendanceClassCodeInput.value){
      alert('Please enter a passcode for taking attendance.')
      return;
    }
    // save preferred minutes value
    localStorage.minutesToCollectAttendance=$('#minutesToCollectAttendance').innerText;
    // save attendance info for section
    let sectionId=$('#getAttendanceSectionId').innerText;
    let section=await getSection(localStorage.semesterSelected,sectionId);
    section.a=md5(getAttendanceClassCodeInput.value).toUpperCase();
    section.e=db.now()+60*parseFloat($('#minutesToCollectAttendance').innerText);
    // mark section as taking-attendance locally
    localStorage.attendanceCode=getAttendanceClassCodeInput.value;
    localStorage.takingAttendance=sectionId;
    localStorage.attendanceEndtime=section.e;
    // update UI and start timer
    takingAttendance();
    // update section in database
    // TODO: errorcheck
    db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+sectionId,{s:localStorage.semesterSelected,id:sectionId,i:section.i,a:section.a,e:section.e});
    if(section?.x?.length){
      for(let crossListId of section.x){
        db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+crossListId,{s:localStorage.semesterSelected,id:crossListId,i:section.i,a:section.a,e:section.e});
      }
    }
    //TODO:
    // save seat requirement option
  }else{
    stopTakingAttendance();
  }
}

function takingAttendance(){
  collectAttendanceBtn.innerText='Stop';
  getAttendanceClassCodeInput.setAttribute('disabled',true);
  $('#getAttendance .back').setAttribute('disabled',true);
  $('#collectingAttendance').innerText='Collecting';
  $('#createQRCodeBtn').classList.remove('hidden');
  $('#randomAttendanceClassCodeBtn').classList.add('hidden');
  $('#minutesToCollectAttendance').removeAttribute('contenteditable');
  clearInterval(attendanceTimer);
  attendanceTimer=setInterval(updateAttendanceTime,1000);
}

// TODO: update time on QR code screen, as well
function updateAttendanceTime(){
  let secondsLeftToEnd=parseInt(localStorage.attendanceEndtime)-db.now();
  if(secondsLeftToEnd<=0){
    stopTakingAttendance();
  }else{
    let minutes=Math.floor(secondsLeftToEnd/60);
    let seconds=secondsLeftToEnd-minutes*60;
    $('#minutesToCollectAttendance').innerText=minutes+':'+pad0(seconds);
  }
}

async function stopTakingAttendance(){
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
  $('#createQRCodeBtn').classList.add('hidden');
  $('#randomAttendanceClassCodeBtn').classList.remove('hidden');
  $('#minutesToCollectAttendance').setAttribute('contenteditable','true');
  $('#minutesToCollectAttendance').innerText=localStorage.minutesToCollectAttendance||'75.0';
  delete localStorage.takingAttendance;
  delete localStorage.attendanceCode;
  delete localStorage.attendanceEndtime;
}


/////////// Create/Edit Section /////////////////////

const CREATE_SECTION_BUTTON_TEXT = 'Create New Section';

async function deleteSection(semester,id){
  if(confirm('Are you sure you want to delete section '+id+' for '+semester+'?\n\nWARNING: All attendance data for this section and any cross-listed sections will be deleted.')){
    let r=await db.updateOne('sections',semester,null);
    //TODO: remove attendance data for this and cross-listed sections
    if(r.error){
      alert('Error: Cannot delete section.')
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
    x:$('#sectionCrosslistInput').value?.split('\n')?.map(txt=>txt.trim())?.filter(txt=>txt)
  };
  if(!semester){
    alert('Please select semester.');
    return;
  }
  if(!id){
    alert('Please enter section id.');
    return;
  }else if(creatingNewSection && await getSection(semester,id)){
    alert('Section '+id+' already exists.')
    return;
  }
  if(!sectionData.pattern){
    alert('Please enter section day/time pattern.');
    return;
  }
  if(!sectionData.room){
    alert('Please select a room.');
    return;
  }
  if(!sectionData.i){
    alert('Please enter section instructor(s).');
    return;
  }
  let sections=await getSections(semester);
  for(let sectionId in sections){
    if(sectionId!==id){
      let section=sections[sectionId];
      if(section.pattern===sectionData.pattern && section.room===sectionData.room){
        alert(section.room+' is booked at this time by section '+sectionId+'.\n\nIf these sections are cross-listed, please edit information for '+sectionId+' to indicate this, rather than creating a new section.');
        return;
      }
    }
  }
  let r=await db.updateOne('sections',semester,{[id]:sectionData});
  if(r.error){
    alert('Error: Cannot add section.')
  }else{
    sections[id]=sectionData;
    addSectionCard(id,sectionData,$('#instructorSections'));
    navigateBack();
  }
});

async function createNewSection(){
  //TODO: make sure semester is selected
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
      if(semester==localStorage.semesterSelected){
        option.setAttribute('selected',true);
      }
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
  // fill instructor option
  $('#sectionIdInput').setAttribute('disabled',true);
  $('#sectionIdInput').value=sectionId;
  $('#sectionPatternInput').value=section.pattern;
  $('#sectionCrosslistInput').value=section?.x?.join('\n')||'';
  $('#sectionInstructorInput').value=section?.i?.join('\n')||'';
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
    alert('Something went wrong.')
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
  //TODO: make sure semester is selected
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
    studentSections.classList.add('hidden');
    instructorSections.classList.add('hidden');
    return;
  }
  studentSections.classList.remove('hidden');
  if(userDoc.r&INSTRUCTOR){
    instructorSections.classList.remove('hidden');
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
    saveNameBtn.classList.remove('hidden');
  }else{
    saveNameBtn.classList.add('hidden');
  }
});
saveNameBtn.addEventListener('click',async e=>{
  saveNameBtn.setAttribute('disabled','true');
  let r=await db.updateOne('users',auth.currentUser.email,{n:nameInput.value});
  if(!r.error){
    saveNameBtn.classList.add('hidden');
    nameInput.lastValue=nameInput.value;
  }
  saveNameBtn.removeAttribute('disabled');
})


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
