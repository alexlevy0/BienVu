import {createContext,useContext} from 'react';
// Local marketing exports only. The normal generation contract and its render
// stay identical when no layer is selected.
export const MarketingLayerContext=createContext<'background'|'foreground'|undefined>(undefined);
export const useMarketingLayer=()=>useContext(MarketingLayerContext);
