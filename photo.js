
var cameraStream;

function stopCamera(){
  //TODO: check if there is a better way to stop camera (because green light is still on on phone after stop)
  cameraStream?.getTracks()?.forEach(track=>track.stop());
}

async function startCamera(video,size){
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = cameraStream;
  setTimeout(()=>{
    try{
      if(video.videoWidth>video.videoHeight){
        video.setAttribute('height',size);
        video.removeAttribute('width');
      }else{
        video.setAttribute('width',size);
        video.removeAttribute('height');
      }
      toast([video.videoWidth,video.videoHeight,video.getAttribute('width'),video.getAttribute('height')].toString())
    }catch(e){
      toast(video.width+','+video.height,'ERROR',-1);
    }
  },200);
}

function takePhoto(video,canvas,size,imageType="image/jpeg"){
  return new Promise(async function(resolve, reject){
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
    // data url of the image
    // return canvas.toDataURL('image/jpeg');
    // return canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    canvas.toBlob(resolve,imageType);
  });
}
