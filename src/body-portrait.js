// Authored surface studies, not camera views or rotational ephemerides.
// PNGs are spherical projections of the already-attributed local SSS maps.
const STUDIES=Object.freeze({
 mercury:{radius:49,label:'CRATERED SURFACE'},venus:{radius:58,label:'CLOUD STUDY'},
 earth:{radius:59,label:'OCEAN & LAND'},mars:{radius:53,label:'SURFACE RELIEF'},
 jupiter:{radius:66,label:'BANDED ATMOSPHERE'},saturn:{radius:45,label:'RING SYSTEM'},
 uranus:{radius:55,label:'AXIS STUDY'},neptune:{radius:57,label:'BLUE ATMOSPHERE'},
 pluto:{radius:47,label:'ILLUSTRATED DWARF WORLD'}
});
export function renderBodyPortrait(container,body){
 if(container.dataset.body===body.id)return;
 const study=STUDIES[body.id];if(!study)throw new RangeError('Unknown portrait body');
 const r=study.radius,cx=120,cy=81;
 const rings=body.id==='saturn',sideways=body.id==='uranus';
 const before=rings?'<g class="portrait-rings" transform="rotate(-18 120 81)"><ellipse cx="120" cy="81" rx="104" ry="29"/><ellipse cx="120" cy="81" rx="96" ry="26"/><ellipse cx="120" cy="81" rx="86" ry="23"/></g>':'';
 const surface=body.id==='pluto'?`<circle cx="120" cy="81" r="47" class="portrait-pluto"/><g clip-path="url(#portrait-clip)"><path class="portrait-pluto-patch" d="M78 58Q101 44 109 73Q126 54 150 69L160 110Q130 124 113 93Q87 105 78 58Z"/><circle class="portrait-crater" cx="94" cy="61" r="9"/><circle class="portrait-crater" cx="106" cy="105" r="5"/><circle class="portrait-crater" cx="148" cy="60" r="6"/><circle cx="120" cy="81" r="47" fill="url(#portrait-shade)"/></g>`:`<image href="/assets/portraits/${body.id}.png" x="${cx-r}" y="${cy-r}" width="${r*2}" height="${r*2}" transform="rotate(${body.tiltDeg} 120 81)"/>`;
 const after=rings?'<g class="portrait-rings" transform="rotate(-18 120 81)"><path d="M16 81a104 29 0 0 0 208 0"/><path d="M24 81a96 26 0 0 0 192 0"/><path d="M34 81a86 23 0 0 0 172 0"/></g>':'';
 const axis=sideways?'<path class="portrait-axis" d="M39 70L200 92M43 62L35 77M204 85L196 100"/>':'';
 container.dataset.body=body.id;
 container.innerHTML=`<svg viewBox="0 0 240 166" role="img" aria-label="${body.name} surface study — illustrative, not a live view"><defs><clipPath id="portrait-clip"><circle cx="120" cy="81" r="47"/></clipPath><linearGradient id="portrait-shade"><stop class="portrait-light"/><stop offset="1" class="portrait-dark"/></linearGradient></defs><path class="portrait-registration" d="M2 22V2H22M218 2h20v20M2 144v20h20M218 164h20v-20"/>${before}${surface}${after}${axis}</svg><figcaption><span class="hud">${study.label}</span><span class="microcopy">Illustrative lighting · not to scale</span></figcaption>`;
}
