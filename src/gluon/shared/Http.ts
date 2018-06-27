export function isSuccessCode(httpCode: number) {
    return httpCode < 300 && httpCode >= 200;
}
