const KEY='AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const URL_=`https://www.youtube.com/youtubei/v1/player?key=${KEY}&prettyPrint=false`;
const CLIENTS=[
 {n:'ANDROID_VR',v:'1.62.27',ua:'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1) gzip',d:{androidSdkVersion:32,osName:'Android',osVersion:'12'}},
 {n:'TVHTML5_SIMPLY_EMBEDDED_PLAYER',v:'2.0',ua:'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',tp:{embedUrl:'https://www.youtube.com/'}},
 {n:'IOS',v:'20.10.4',ua:'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',d:{deviceModel:'iPhone16,2',osName:'iPhone',osVersion:'18.3.2.22D82'}},
 {n:'ANDROID',v:'20.10.38',ua:'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',d:{androidSdkVersion:30,osName:'Android',osVersion:'11'}},
 {n:'WEB_EMBEDDED_PLAYER',v:'1.20250310.01.00',ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',tp:{embedUrl:'https://www.youtube.com/'}},
];
(async()=>{
 for (const c of CLIENTS){
  try{
   const r=await fetch(URL_,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':c.ua},body:JSON.stringify({context:{client:{clientName:c.n,clientVersion:c.v,hl:'es',gl:'ES',...c.d}},...(c.tp?{thirdParty:c.tp}:{}),videoId:'CCHdMIEGaaM',contentCheckOk:true,racyCheckOk:true}),signal:AbortSignal.timeout(15000)});
   const j=await r.json();
   const st=j?.playabilityStatus?.status;
   const ad=(j?.streamingData?.adaptiveFormats||[]).filter(f=>String(f.mimeType||'').startsWith('audio/'));
   console.log(c.n.padEnd(32), r.status, String(st).padEnd(12), 'audio:',ad.length, ad[0]?'url:'+String(ad[0].url).slice(0,40):(j?.playabilityStatus?.reason||'').slice(0,60));
  }catch(e){console.log(c.n.padEnd(32),'ERR',e.message)}
 }
})();
