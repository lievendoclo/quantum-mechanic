export function usernameFromDomainUsername(domainUsername: string): string {
    return /[^\\]*$/.exec(domainUsername)[0];
}
