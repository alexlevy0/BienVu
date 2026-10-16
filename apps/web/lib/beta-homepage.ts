/** Keep authentication, trial cookies and payments on the existing origin. */
export function betaHomepageRedirect(request:Request):Response|null{
  const input=new URL(request.url);
  if(input.hostname!=='beta.bienvu.online')return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Méthode non autorisée',{status:405,headers:{Allow:'GET, HEAD','X-Robots-Tag':'noindex, nofollow'}});
  const destination=new URL('https://bienvu.online');
  destination.pathname=input.pathname==='/'?'/beta':input.pathname;
  destination.search=input.search;
  return new Response(null,{status:302,headers:{Location:destination.href,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
}
