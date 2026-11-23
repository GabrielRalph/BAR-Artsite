async function getIPInfo(){
    let info = {
        country: "Unknown",
        countryCode: "XX",
        postCode: "-",
        state: "-",
        city: "-",
        org: "Unknown",
        ip: "-:-:-",

        agent: navigator.userAgent,
        maxThreads: navigator.hardwareConcurrency || 1,
        platform: navigator.platform,
        memory: navigator.deviceMemory || 1
    };
    try {
        // Looks up the caller's own IP and its info in one request.
        // (ip-api.com only serves HTTPS on paid plans, so it's blocked on an HTTPS page.)
        let res = await (await fetch(`https://ipapi.co/json/`)).json();
        if (res.error) {
            console.log(`ipapi.co: ${res.reason}`);
            info.error = res.reason;
        } else {
            info = {
                ...info,
                ...res,
                country: res.country_name,
                countryCode: res.country_code,
                postCode: res.postal,
                state: res.region,
            }
        }
    } catch (e) {
        console.log(e);
        info.error = e.message;
    }
    return info;
}


export { getIPInfo };

