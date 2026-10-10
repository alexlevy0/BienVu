import type {Instrumentation} from 'next';
import {captureServerException} from './lib/error-tracking-server';

export const onRequestError:Instrumentation.onRequestError=(error,_request,context)=>{
 captureServerException(error,{source:'nextjs',path:context.routePath,routeType:context.routeType,routerKind:context.routerKind});
};
