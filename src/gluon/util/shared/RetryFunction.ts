export async function retryFunction(retryAttempts: number, waitBeforeRetry: number, fn: (attemptNumber: number) => Promise<boolean>) {
    let retryCount = 0;
    let success = false;
    while (!success && retryCount < retryAttempts) {
        retryCount += 1;
        success = await fn(retryCount);
        if (retryCount < retryAttempts) {
            await delay(waitBeforeRetry);
        }
    }

    return success;
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
