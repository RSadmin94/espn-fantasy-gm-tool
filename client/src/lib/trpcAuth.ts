let _token: string | null = null;
export const setTrpcToken = (t: string | null) => { _token = t; };
export const getTrpcToken = () => _token;
