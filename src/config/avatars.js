// Avatar Configuration for ALTYFLIX
// Automatically organized by user-defined folders in public/avatars/

export const AVATAR_CATEGORIES = [
    {
        "id": "netflix",
        "title": "Netflix",
        "avatars": [
            "/avatars/netflix/avatar_6FgZxbi.png",
            "/avatars/netflix/avatar_AFN9X8K.png",
            "/avatars/netflix/avatar_APYSZGK.png",
            "/avatars/netflix/avatar_BxsbBsu.png",
            "/avatars/netflix/avatar_I9ns8dV.png",
            "/avatars/netflix/avatar_LJ9dB0T.png",
            "/avatars/netflix/avatar_OnOEIhZ.png",
            "/avatars/netflix/avatar_QhKoEyB.png",
            "/avatars/netflix/avatar_WK2idvp.png",
            "/avatars/netflix/avatar_WM6zTNc.png",
            "/avatars/netflix/avatar_WmB8jg2.png",
            "/avatars/netflix/avatar_dk4Wyhp.png",
            "/avatars/netflix/avatar_eQHooLm.png",
            "/avatars/netflix/avatar_jWWmZ4o.png",
            "/avatars/netflix/avatar_kDoJa0M.png",
            "/avatars/netflix/avatar_pfNi87l.png",
            "/avatars/netflix/avatar_prnpovw.png",
            "/avatars/netflix/avatar_wBbehpY.png",
            "/avatars/netflix/avatar_zBr1CQ3.png",
            "/avatars/netflix/users-1.png",
            "/avatars/netflix/users-5.png"
        ]
    },
    {
        "id": "baby_boss",
        "title": "Baby Boss",
        "avatars": [
            "/avatars/Baby Boss/avatar_2DuaS2D.png",
            "/avatars/Baby Boss/avatar_yhnwhe1.png"
        ]
    },
    {
        "id": "bojack_horseman",
        "title": "Bojack Horseman",
        "avatars": [
            "/avatars/Bojack Horseman/avatar_4EFiHC6.png",
            "/avatars/Bojack Horseman/avatar_sQtzYQV.png",
            "/avatars/Bojack Horseman/avatar_u1DJo5h.png"
        ]
    },
    {
        "id": "casa_del_papel",
        "title": "Casa Del Papel",
        "avatars": [
            "/avatars/Casa Del Papel/avatar_0tsTsw8.png",
            "/avatars/Casa Del Papel/avatar_siylyIN.png"
        ]
    },
    {
        "id": "stranger_things",
        "title": "Stranger Things",
        "avatars": [
            "/avatars/Stranger Things/avatar_1SdlYmc.png",
            "/avatars/Stranger Things/avatar_2Xn9a1H.png",
            "/avatars/Stranger Things/avatar_4HP8NGK.png",
            "/avatars/Stranger Things/avatar_CANzj7P.png",
            "/avatars/Stranger Things/avatar_CjMherY.png",
            "/avatars/Stranger Things/avatar_JdYIFkw.png",
            "/avatars/Stranger Things/avatar_eLZuR79.png",
            "/avatars/Stranger Things/avatar_h3TdDQk.png",
            "/avatars/Stranger Things/avatar_j5Q83Ob.png",
            "/avatars/Stranger Things/avatar_zYfYlE7.png"
        ]
    }
];

export const ALL_AVATARS = AVATAR_CATEGORIES.reduce((acc, category) => {
    return [...acc, ...category.avatars];
}, []);

export default {
    AVATAR_CATEGORIES,
    ALL_AVATARS
};
