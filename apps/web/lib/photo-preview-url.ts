// Only our authenticated photo route has a preview variant. Local uploads and
// guest demo/blob URLs keep their existing behavior.
export function photoPreviewUrl(original:string){
  return /^\/api\/imports\/[a-zA-Z0-9_-]+\/photos\/[a-zA-Z0-9_-]+$/.test(original)?`${original}/preview`:original;
}
