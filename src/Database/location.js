
async function getIPLocation(){
    let location = {};
    try {
        // Looks up the caller's own IP and its location in one request.
        // (ip-api.com only serves HTTPS on paid plans, so it's blocked on an HTTPS page.)
        let info = await (await fetch(`https://ipapi.co/json/`)).json();
        if (info.error) throw new Error(`ipapi.co: ${info.reason}`);

        location = {
            city: info.city,
            country: info.country_name,
            countryCode: info.country_code,
            postCode: info.postal,
            state: info.region,
            ip: info.ip
        }
    } catch (e) {
        console.log(e);
    }
    // console.log("ip location:", location);
    return location;
}


export { getIPLocation };

