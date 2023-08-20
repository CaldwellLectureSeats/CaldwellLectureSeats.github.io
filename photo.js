
var cameraStream;
var cameraStreamVideoElement;
var cameraStreamSize;

function stopCamera(){
  cameraStream?.getTracks()?.forEach(track=>track.stop());
}

function getVideoStream(userFacing){
  return navigator.mediaDevices.getUserMedia({video:{facingMode:userFacing?'user':'environment'},audio:false});
}

async function getAllCameraIds(){
  return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput').map(d=>d.deviceId);
}

async function switchCameraStream(currentStream){
  let allCameraIds=await getAllCameraIds();
  let currentDeviceId=currentStream.getVideoTracks()[0].getSettings().deviceId;
  let currentDeviceIndex=allCameraIds.indexOf(currentDeviceId);
  currentStream?.getTracks()?.forEach(track=>track.stop());
  return await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:allCameraIds[1-currentDeviceIndex]}},audio:false});
}

async function switchCamera(){
  if(!cameraStream)return;
  cameraStream=await switchCameraStream(cameraStream);
  startVideoFromCameraStream();
}

async function startCamera(video,size){
  cameraStreamVideoElement=video;
  cameraStreamSize=size;
  cameraStream = await getVideoStream(true);
  startVideoFromCameraStream();
}

function startVideoFromCameraStream(){
  cameraStreamVideoElement.srcObject = cameraStream;
  cameraStreamVideoElement.onloadedmetadata = function(e) {
    if(cameraStreamVideoElement.videoWidth>cameraStreamVideoElement.videoHeight){
      cameraStreamVideoElement.setAttribute('height',cameraStreamSize);
      cameraStreamVideoElement.removeAttribute('width');
    }else{
      cameraStreamVideoElement.setAttribute('width',cameraStreamSize);
      cameraStreamVideoElement.removeAttribute('height');
    }
    cameraStreamVideoElement.play();
  }
}

function takePhoto(video,canvas,size,imageType="image/jpeg"){
  var aspectRatio=video.videoWidth/video.videoHeight;
  if(aspectRatio>1){
    var outputHeight=size;
    var outputWidth=size*aspectRatio;
  }else{
    var outputHeight=size/aspectRatio;
    var outputWidth=size;
  }
  // calculate the position to draw the image at
  var outputX=(size-outputWidth)*0.5;
  var outputY=(size-outputHeight)*0.5;
  // set canvas size and position
  canvas.width=size;
  canvas.height=size;
  canvas.getContext('2d').drawImage(video,outputX,outputY,outputWidth,outputHeight);
  stopCamera();
  canvas.style.width=size;
}

function canvasToBlob(canvas,imageType="image/jpeg",quality){
  return new Promise(async function(resolve, reject){
    canvas.toBlob(resolve,imageType,quality);
  });
}
