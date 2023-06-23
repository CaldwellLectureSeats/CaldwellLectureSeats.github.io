
var cameraStream;

function stopCamera(){
  cameraStream?.getTracks()?.forEach(track=>track.stop());
}

async function startCamera(video,size){
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = cameraStream;
  setTimeout(()=>{
    if(video.videoWidth>video.videoHeight){
      video.setAttribute('height',size);
      video.removeAttribute('width');
    }else{
      video.setAttribute('width',size);
      video.removeAttribute('height');
    }
  },100);
}

function takePhoto(video,canvas,size){
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
  stopStream();
  canvas.style.width=size;
  // data url of the image
  return canvas.toDataURL('image/jpeg');
}
