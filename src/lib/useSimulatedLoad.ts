


import { useEffect, useState } from 'react';

/** Simulates an initial data fetch so we can showcase loading skeletons. */
export function useSimulatedLoad(delay = 650): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return loading;
}