import {suspendProductAnalytics} from './lib/product-analytics';
import {tawkNavigationStart} from './lib/tawk-chat';

export function onRouterTransitionStart(url:string){suspendProductAnalytics();tawkNavigationStart(url);}
