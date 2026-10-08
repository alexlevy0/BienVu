import {suspendProductAnalytics} from './lib/product-analytics';

export function onRouterTransitionStart(){suspendProductAnalytics();}
