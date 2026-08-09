// swc-guard.js
// SwCTools debug guard

(function () {

    console.log(
        "%c[SWC GUARD] loaded",
        "color:green;font-weight:bold"
    );


    const PAGES_HOST = "swctools.pages.dev";
    const MAIN_HOST = "swctools.dpdns.org";


    console.log(
        "[SWC GUARD] origin:",
        location.origin
    );

    console.log(
        "[SWC GUARD] path:",
        location.pathname
    );

    console.log(
        "[SWC GUARD] cookie:",
        document.cookie
    );

    console.log(
        "[SWC GUARD] session:",
        sessionStorage.getItem("swc_verified")
    );



    // ==========================
    // pages.dev 跳转
    // ==========================

    if (location.hostname === PAGES_HOST) {

        const target =
            location.protocol +
            "//" +
            MAIN_HOST +
            location.pathname +
            location.search +
            location.hash;


        console.log(
            "[SWC GUARD] pages redirect:",
            target
        );


        location.replace(target);

        return;
    }



    // ==========================
    // 非主域名
    // ==========================

    if (location.hostname !== MAIN_HOST) {

        console.log(
            "[SWC GUARD] not main host"
        );

        return;
    }




    // ==========================
    // antirobot 页面跳过
    // ==========================

    if (
        location.pathname === "/antirobot" ||
        location.pathname.endsWith("/antirobot.html")
    ) {

        console.log(
            "[SWC GUARD] antirobot page skip"
        );

        return;
    }





    // ==========================
    // 登录检测
    // ==========================

    const token =
        localStorage.getItem("swc_token");


    console.log(
        "[SWC GUARD] token:",
        token ? "exists" : "none"
    );



    if (token) {

        try {


            const parts =
                token.split(".");


            if (parts.length === 3) {


                const payload =
                    JSON.parse(
                        decodeURIComponent(
                            escape(
                                atob(
                                    parts[1]
                                    .replace(/-/g, "+")
                                    .replace(/_/g, "/")
                                )
                            )
                        )
                    );


                console.log(
                    "[SWC GUARD] payload:",
                    payload
                );



                if (
                    !payload.exp ||
                    payload.exp >
                    Math.floor(Date.now()/1000)
                ) {


                    console.log(
                        "[SWC GUARD] login allow"
                    );


                    return;

                }

            }


        } catch(e) {


            console.log(
                "[SWC GUARD] token error",
                e
            );


        }

    }






    // ==========================
    // session 验证检测
    // ==========================


    const verified =
        sessionStorage.getItem(
            "swc_verified"
        );


    console.log(
        "[SWC GUARD] verified:",
        verified
    );



    if (verified === "1") {


        console.log(
            "%c[SWC GUARD] human verified allow",
            "color:green;font-weight:bold"
        );


        return;

    }






    // ==========================
    // 未验证
    // ==========================


    const redirect =
        encodeURIComponent(
            location.href
        );


    const target =
        "/antirobot?redirect=" + redirect;



    console.log(
        "%c[SWC GUARD] redirect antirobot",
        "color:red;font-weight:bold"
    );


    console.log(
        "[SWC GUARD] target:",
        target
    );



    location.replace(target);



})();
