/* eslint-disable no-prototype-builtins */
const FREE_SPACE = 500

export const checkLocalStorageSpace = (): boolean => {
    let data = ''
    for (const key in window.localStorage) {
        if (window.localStorage.hasOwnProperty(key)) {
            data += window.localStorage[key]
        }
    }
    return 5120 - +((data.length * 16) / (8 * 1024)).toFixed(2) > FREE_SPACE
}

export const translateTimeStamp = (timeStamp: number): string => {
    return `${Math.floor(timeStamp / 60)}분 ${timeStamp % 60}초`
}
