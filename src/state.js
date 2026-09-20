import {SCIENCE} from './science.js';
export const MIN_DATE=Date.parse(SCIENCE.range.start+'T00:00:00Z');
export const MAX_DATE=Date.parse(SCIENCE.range.end+'T00:00:00Z');
export function advance(state, dt) {
  if(!state.playing || !Number.isFinite(dt) || dt<0) return;
  const next=state.date.getTime()+Math.min(dt,0.1)*state.speed*86400000;
  const clamped=Math.max(MIN_DATE,Math.min(MAX_DATE,next));
  state.date=new Date(clamped);
  if(next!==clamped) state.playing=false;
}
export function setDate(state,value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z'),ms=date.getTime();
  if(!Number.isFinite(ms)||ms<MIN_DATE||ms>MAX_DATE||date.toISOString().slice(0,10)!==value)return false;
  state.date=date;return true;
}
export const DAYS_PER_TURN=30;
export function turnCrank(state,turns){
 if(typeof turns!=='number'||!Number.isFinite(turns))return false;
 state.playing=false;
 const next=state.date.getTime()+turns*DAYS_PER_TURN*86400000;
 state.date=new Date(Math.max(MIN_DATE,Math.min(MAX_DATE,next)));
 return true;
}
export function createState(date = new Date()) {
  return {date:new Date(date), mode:'mechanical', pluto:false, moons:true, lightsOut:false, baseStyle:'nebula', selected:'earth', scale:'display', labels:false, playing:false, speed:1};
}
