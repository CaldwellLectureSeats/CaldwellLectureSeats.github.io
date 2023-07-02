
var cameraStream;

function stopCamera(){
  console.log('stopping camera')
  //TODO: check if there is a better way to stop camera (because green light is still on on phone after stop)
  cameraStream?.getTracks()?.forEach(track=>track.stop());
}

async function startCamera(video,size){
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = cameraStream;
  video.onloadedmetadata = function(e) {
    if(video.videoWidth>video.videoHeight){
      video.setAttribute('height',size);
      video.removeAttribute('width');
    }else{
      video.setAttribute('width',size);
      video.removeAttribute('height');
    }
    video.play();
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
