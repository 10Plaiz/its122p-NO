// Test-only adapter for camera and Places events. It never requests Google services.
import React from '__REACT_URL__';
const {useEffect,useRef}=React;
let center = {lat:14.5547,lng:121.0244};
let listener = () => {};
let zoom = 15;
let idle = () => {};
const map = {
  getCenter: () => ({lat:()=>center.lat,lng:()=>center.lng}),
  panTo: point => {center=point; queueMicrotask(()=>{listener({detail:{center}});idle();});},
  getZoom:()=>zoom, setZoom:value=>{zoom=value;},
};
export function Map(props) {
  const latest=useRef(props);
  latest.current=props;
  useEffect(()=>{
    center=props.defaultCenter;
    listener=event=>latest.current.onCenterChanged?.(event);
    idle=()=>latest.current.onIdle?.();
    listener({detail:{center}});
    idle();
    return ()=>{listener=()=>{};};
  },[]);
  return React.createElement('div', {role:'region','aria-label':'Simulated map',tabIndex:0,style:props.style,
    onKeyDown:event=>{if(event.key==='ArrowRight'){event.preventDefault();map.panTo({...center,lng:center.lng+0.0002});}}}, props.children);
}
export const useMap = () => map;
class SimulatedPlaces extends HTMLElement {
  constructor() {
    super();
    const result=document.createElement('button');
    result.type='button'; result.textContent='Simulated search result';
    result.onclick=()=>{
      const event=new Event('gmp-select');
      event.placePrediction={toPlace:()=>({fetchFields:async()=>{},location:{lat:()=>14.555,lng:()=>121.025}})};
      this.dispatchEvent(event);
    };
    const failure=document.createElement('button');
    failure.type='button'; failure.textContent='Simulate Places failure';
    failure.onclick=()=>this.dispatchEvent(new Event('gmp-error'));
    this.append(result,failure);
  }
}
customElements.define('simulated-place-search',SimulatedPlaces);
const places={PlaceAutocompleteElement:SimulatedPlaces};
export const useMapsLibrary=()=>places;
export const APIProvider=({children})=>children;
export const APILoadingStatus={AUTH_FAILURE:'AUTH_FAILURE',FAILED:'FAILED'};
export const useApiLoadingStatus=()=> 'LOADED';
export const ControlPosition={LEFT_BOTTOM:0};
export const Polygon=()=>null;
export const MapControl=({children})=>children;
export const AdvancedMarker=()=>null;
