'use strict'


/////////////////// Constants //////////////////////

const SEMESTER_SECTION_SEPARATOR = '|'; //TODO: ensure this string doesn't appear in semester or section name
const INSTRUCTOR=1, ADMIN=2;


////////////// Helper functions ////////////////////

const $ = document.querySelector.bind(document);

function makefirstElementChild(parent, child){
  if(parent.firstElementChild!==child){
    parent.insertBefore(child,parent.firstElementChild);
  }
}


///////////// Initialize and Sign in ///////////////

var userDoc;
window.addEventListener('load', async function(){
  // parse location
  let attendanceCode=(new URLSearchParams(location.search)).get('a');
  if(attendanceCode){
    localStorage.attendanceCode=attendanceCode;
  }
  window.history.pushState(null,'LectureSeats',location.origin+this.location.pathname);
  // login functionality
  onAuth(async function(user){
    if(user){
      // User is signed in: Hide sign-in button and display main
      if(!user.email.endsWith('@caldwell.edu')){
        console.warn('User not from allowed domain.');
      }
      $('#firebaseui-auth-container').classList.add('hidden');
      $('#user').classList.remove('hidden');
      mainDiv.classList.remove('hidden');
      $('#userDisplayName').innerText=user.displayName;
      $('#userPhoto').src=user.photoURL;
      userDoc=await db.findOne('users',user.email);
      // if this is a new user, update their record in the database
      if(userDoc.error){
        alert('Something went wrong.');
        return;
      }else if(userDoc===null){
        userDoc={n:user.displayName};
        await db.insertOne('users', userDoc, user.email);
      }else if(!userDoc.n){
        await db.updateOne('users', user.email, {n:user.displayName});
      }
      // display user name
      nameInput.value=nameInput.lastValue=userDoc.n||user.displayName;
      // display instructor and admin options, depending on permissions
      if(userDoc.r&INSTRUCTOR){
        $('#instructorSections').classList.remove('hidden');
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
            addSectionCards(semester);
          }
        }
      }
      // prefill saved values
      if(localStorage.minutesToCollectAttendance){
        $('#minutesToCollectAttendance').innerText=localStorage.minutesToCollectAttendance;
      }
      // redirect if there was an attendance code
      // TODO:
      console.log('redirecting:',localStorage.attendanceCode)
    }else{
      // User is signed out: Display sign-in button, hide main
      $('#firebaseui-auth-container').classList.remove('hidden');
      mainDiv.classList.add('hidden');
      $('#user').classList.add('hidden');
      let ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);
      ui.start('#firebaseui-auth-container', {
        signInOptions: [
          firebase.auth.GoogleAuthProvider.PROVIDER_ID
        ],
        signInSuccessUrl:'#',
      });
    }
  },
  error=>console.error(error) );
});


///////////////////// Navigation ///////////////////

const mainDiv = $('#main');
function showInMain(childOfMain){
  makefirstElementChild(mainDiv,document.getElementById(childOfMain));
}
function hideInMain(childOfMain){
  mainDiv.appendChild(document.getElementById(childOfMain));
}

$('#addStudentSectionBtn').addEventListener('click',async e=>{
  //TODO: make sure semester is selected
  showInMain('selectStudentSection');
  await addAvailableStudentSections();
  if(!$('#availableStudentSections').innerText){
    $('#availableStudentSections').appendChild(document.createElement('div')).innerText='No sections available.';
  }
});

$('#addInstructorSectionBtn').addEventListener('click',async e=>{
  //TODO: make sure semester is selected
  showInMain('addInstructorSection');
  // fill semester options
  let option;
  let sectionSemesterSelect=$('#sectionSemesterSelect');
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
});


//////////// Get semesters, sections, rooms ////////

var allSections={},allRooms=[],allSemesters=['2023Fall','2024Winter','2024Spring'];

async function getSemesters(){
  return ['2023Fall','2024Winter','2024Spring'];
}

async function getSections(semester){
  //TODO: make sure semester is selected
  if(!allSections[semester]){
    allSections[semester]=await db.findOne('sections',semester);
    if(allSections[semester].error){
      console.log('Something went wrong.');
      return;
    }else if(allSections[semester]===null){
      db.insertOne('sections',{a:[]},semester);
      allSections[semester]={a:[]};
    }
  }
  return allSections[semester].a;
}

async function getSection(semester,sectionId){
  return (await getSections(semester)).filter(s=>s.id===sectionId)[0];
}

async function getRooms(semester){
  if(!allRooms?.length){
    allRooms=await db.find('rooms');
  }
  return allRooms;
}

async function getCurrentlyTakingAttendance(semester,sectionIds){
  var r=await db.find('attend',['s','==',semester],['id','in',sectionIds],['e','>',db.now()]);
  if(r.error){
    alert('Something went wrong.');
    return;
  }
  return r;
}


//////////////// Mark Attendance ///////////////////

$('#markAttendanceButton').addEventListener('click',async event=>{
  let code=$('#markAttendanceClassCodeInput').value;
  if(code){
    //TODO: cannot have email as field (uses dots to create hierarchy)
    let user=auth.currentUser.email.split('@')[0].replaceAll('.','_');
    let data={'_a': code, [user]: db.now() };
    console.log( JSON.stringify(data) )
    let r=await db.updateOne('attend',
      localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+$('#markAttendanceSectionId').innerText,
      data );
      // {'_a': code, [auth.currentUser.email.replaceAll('.','_')]: db.now() } );
      // new db.FieldPath(auth.currentUser.email), db.arrayUnion( db.now() ) );
    if(r.error){
      alert('Something went wrong.',r.error);
    }else{
      alert('Your attendance was marked.')
    }
    //TODO: save receipt (in gdrive)
  }
})

function openQRreader(target){
  showInMain('QRreader');
  var html5QrcodeScanner = new Html5QrcodeScanner("QRreaderVideo", {fps:10,qrbox:250});
  html5QrcodeScanner.render(onScanSuccess);
  function closeQRreader(){
    html5QrcodeScanner.clear();
    hideInMain('QRreader');
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
  openQRreader('markAttendanceClassSeatInput');
}


//////////////// Collect Attendance ////////////////

const getAttendanceClassCodeInput=$('#getAttendanceClassCodeInput');
const collectAttendanceBtn=$('#collectAttendanceBtn');

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
  // let code=location.origin+location.pathname+'?a='+getAttendanceClassCodeInput.value;
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
    // update UI
    collectAttendanceBtn.innerText='Stop';
    getAttendanceClassCodeInput.setAttribute('disabled',true);
    $('#collectingAttendance').innerText='Collecting';
    $('#createQRCodeBtn').classList.remove('hidden');
    $('#randomAttendanceClassCodeBtn').classList.add('hidden');
    $('#minutesToCollectAttendance').removeAttribute('contenteditable');
    // save preferred minutes value
    localStorage.minutesToCollectAttendance=$('#minutesToCollectAttendance').innerText;
    // save attendance info for section
    var section=await getSection(localStorage.semesterSelected,$('#getAttendanceSectionId').innerText);
    section.a=md5(getAttendanceClassCodeInput.value).toUpperCase();
    section.e=db.now()+60*parseFloat($('#minutesToCollectAttendance').innerText);
    // mark section as taking-attendance locally
    localStorage.takingAttendance=JSON.stringify(section);
    // start timer
    localStorage.attendanceEndtime=section.e;
    attendanceTimer=setInterval(updateAttendanceTime,1000);
    // update section in database
    db.upsertOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+section.id,{s:localStorage.semesterSelected,id:section.id,i:section.i,a:section.a,e:section.e});
    //TODO:
    // save seat requirement option
    // add rules that attendance for class is only being taken if code matches and time is less than end-time
  }else{
    stopTakingAttendance();
  }
}

function updateAttendanceTime(){
  let secondsLeftToEnd=parseInt(localStorage.attendanceEndtime)-db.now();
  if(secondsLeftToEnd<=0){
    stopTakingAttendance();
  }else{
    let minutes=Math.floor(secondsLeftToEnd/60);
    let seconds=secondsLeftToEnd-minutes*60;
    $('#minutesToCollectAttendance').innerText=minutes+':'+String(seconds).padStart(2,'0');
  }
}

function stopTakingAttendance(){
  db.updateOne('attend',localStorage.semesterSelected+SEMESTER_SECTION_SEPARATOR+$('#getAttendanceSectionId').innerText,{a:db.deleteField(),e:db.deleteField()});
  clearInterval(attendanceTimer);
  collectAttendanceBtn.innerText='Start';
  getAttendanceClassCodeInput.removeAttribute('disabled');
  $('#collectingAttendance').innerText='Collect';
  $('#createQRCodeBtn').classList.add('hidden');
  $('#randomAttendanceClassCodeBtn').classList.remove('hidden');
  $('#minutesToCollectAttendance').setAttribute('contenteditable','true');
  $('#minutesToCollectAttendance').innerText=localStorage.minutesToCollectAttendance||'75.0';
  delete localStorage.takingAttendance;
}


/////////// Create new section /////////////////////

$('#sectionSubmitBtn').addEventListener('click',async e=>{
  let semester=$('#sectionSemesterSelect').value;
  let newSection={
    id:$('#sectionIdInput').value,
    pattern:$('#sectionPatternInput').value,
    room:$('#sectionRoomSelect').value,
    i:$('#sectionInstructorInput').value?.split('\n').map(txt=>txt.trim())
  };
  if(!semester){
    alert('Please select semester.');
    return;
  }
  if(!newSection.id){
    alert('Please enter section id.');
    return;
  }else if((await getSections(semester)).filter(s=>s.id==newSection.id).length){
    alert('Section '+newSection.id+' already exists.')
    return;
  }
  if(!newSection.pattern){
    alert('Please enter section day/time pattern.');
    return;
  }
  if(!newSection.room){
    alert('Please select a room.');
    return;
  }
  if(!newSection.i){
    alert('Please enter section instructor(s).');
    return;
  }
  let sections=await getSections(semester);
  let r=await db.updateOneArrayUnion('sections',semester,'a',newSection);
  if(r.error){
    alert('Error: Cannot add section.')
  }else{
    sections.push(newSection);
    addSectionCard(newSection,$('#instructorSections'));
    hideInMain('addInstructorSection');
  }
});


//////////////// Section cards /////////////////////

function makeSectionCard(section,onclick){
  var card=document.createElement('div');
  card._sectionDoc=section;
  card.id=section.id;
  card.className='sectionCard';
  if(section.a && section.e && section.e>db.now()){
    card.classList.add('acceptingAttendance');
  }
  var d=card.appendChild(document.createElement('div'));
  d.class='cardTitle';
  d.innerText=section.id;
  d=card.appendChild(document.createElement('div'));
  d.innerText=section.pattern;
  d=card.appendChild(document.createElement('div'));
  d.innerText=section.room;
  section.i.forEach(i=>{
    d=card.appendChild(document.createElement('div'));
    d.innerText=i;
  })
  card.addEventListener('click',onclick);
  return card;
}

async function getAttendanceCardClick(event){
  showInMain('getAttendance');
  var section=await getSection(localStorage.semesterSelected,event.currentTarget.id);
  $('#getAttendanceSectionId').innerText=section.id;
  randomAttendanceClassCodeClick();
}

async function showMarkAttendance(id){
  showInMain('markAttendance');
  var section=(await getSections(localStorage.semesterSelected)).filter(s=>s.id===id)[0];
  $('#markAttendanceSectionId').innerText=id;
}

function markAttendanceCardClick(event){
  showMarkAttendance(event.currentTarget.id);
}

function addSectionToStudentClick(event){
  hideInMain('selectStudentSection');
  if(!userDoc[localStorage.semesterSelected])userDoc[localStorage.semesterSelected]=[];
  userDoc[localStorage.semesterSelected].push(event.currentTarget.id);
  addSectionCard(event.currentTarget._sectionDoc,$('#studentSections'));
  db.updateOneArrayUnion('users',auth.currentUser.email,localStorage.semesterSelected,event.currentTarget.id);
  //TODO: error-check
}

function addSectionCard(section,container,onclick){
  var card=makeSectionCard(section,onclick);
  container.insertBefore(card,container.lastElementChild);
}

async function addAvailableStudentSections(){
  var sections=await getSections(localStorage.semesterSelected);
  var sectionsContainer=$('#availableStudentSections');
  // remove old
  for(let sectionCard of sectionsContainer.children){
    sectionCard.remove();
  }
  // add all available sections
  for(let section of sections){
    if(!userDoc[localStorage.semesterSelected]?.includes(section.id)){
      addSectionCard(section,sectionsContainer,addSectionToStudentClick);
    }
  }
}

async function addSectionCards(semester){
  var sections=await getSections(semester);
  var studentSections=$('#studentSections');
  var instructorSections=$('#instructorSections');
  // remove old
  for(let i=studentSections.childElementCount-1;i--;){
    studentSections.children[i].remove();
  }
  for(let i=instructorSections.childElementCount-1;i--;){
    instructorSections.children[i].remove();
  }
  // add sections
  for(let section of sections){
    if(userDoc[semester]?.includes(section.id)){
      addSectionCard(section,studentSections,markAttendanceCardClick);
    }
    if(!instructorSections.classList.contains('hidden') && section.i.includes(auth.currentUser.email)){
      addSectionCard(section,instructorSections,getAttendanceCardClick);
    }
  }
}

$('#semesterSelect').addEventListener('change',e=>{
  localStorage.semesterSelected=e.target.value;
  addSectionCards(e.target.value);
});


/////////// Name change functionality //////////////

const nameInput=$('#nameInput');
const saveNameBtn=$('#saveNameBtn');
nameInput.addEventListener('input',e=>{
  if(nameInput.lastValue!==nameInput.value){
    saveNameBtn.classList.remove('hidden');
    saveNameBtn.addEventListener('click',async e=>{
      saveNameBtn.setAttribute('disabled','true');
      let r=await db.updateOne('users',auth.currentUser.email,{n:nameInput.value});
      if(!r.error){
        saveNameBtn.classList.add('hidden');
        nameInput.lastValue=nameInput.value;
      }
      saveNameBtn.removeAttribute('disabled');
    })
  }else{
    saveNameBtn.classList.add('hidden');
  }
});


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
