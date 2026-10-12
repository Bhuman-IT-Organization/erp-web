import { useEffect, useState } from 'react';

/**
 * An object URL for `blob`, made when the Blob arrives and revoked when it changes or the component
 * unmounts (PATTERNS M7, T-4.2-48): an api-only image read as a Blob (`useFileBlob`) is shown by
 * this URL, and no URL outlives the image that showed it. `undefined` while there is no Blob, and
 * never a URL made for another Blob.
 */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [made, setMade] = useState<{ readonly blob: Blob; readonly url: string }>();
  // effect: dom: create and revoke the object URL for the current Blob
  useEffect(() => {
    if (blob === undefined) return undefined;
    const url = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is a browser resource made here and revoked by the cleanup below; it cannot be computed during render
    setMade({ blob, url });
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return made !== undefined && made.blob === blob ? made.url : undefined;
}
