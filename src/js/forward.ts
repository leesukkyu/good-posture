/* eslint-disable no-constant-condition */
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as knnClassifier from '@tensorflow-models/knn-classifier'
import * as electron from 'electron'
import {LABEL_TYPE, CONFIG} from '../ini'
import {checkLocalStorageSpace, translateTimeStamp} from './util'
import CustomError from './error'
import {dType} from '../types'
import '../styles/index.scss'

const {ipcRenderer} = electron

interface RendererInterface {
    data: {
        $videoSelect: HTMLSelectElement
        $consoleText: HTMLElement
        $statusText: HTMLElement
        $checkTime: HTMLInputElement
        $checkTimeText: HTMLElement
        $responsiveLevel: HTMLInputElement
        $responsiveLevelText: HTMLElement
        $videoElement: HTMLVideoElement
        $snoozeTime: HTMLInputElement
        $snoozeTimeText: HTMLElement
        $audio: HTMLAudioElement
        stream: MediaStream
        $goodStatusImage: HTMLImageElement
        $badStatusImage: HTMLImageElement
        app: App
    }
    manual: () => void
    onChangeCheckTime: () => void
    onChangeSnoozeTime: (snoozeTime: number) => void
    onChangeResponsiveLevel: (responsiveLevel: number) => void
    onChangeLocalstorage: () => void
    onChangeMediaDevice: (options: {
        video: {
            deviceId?: {exact: string}
        }
    }) => void
    onAppReady: () => void
    setListener: () => void
    init: () => void
    initCamera: () => void
}

const Renderer: RendererInterface = {
    data: {
        $videoSelect: <HTMLSelectElement>document.getElementById('video-device-select'),
        $consoleText: <HTMLElement>document.getElementById('console-text'),
        $statusText: <HTMLElement>document.getElementById('status-text'),
        $videoElement: <HTMLVideoElement>document.getElementById('video'),
        $checkTime: <HTMLInputElement>document.getElementById('check-time'),
        $checkTimeText: <HTMLElement>document.getElementById('check-time-translate-text'),
        $responsiveLevel: <HTMLInputElement>document.getElementById('responsive-level'),
        $responsiveLevelText: <HTMLElement>document.getElementById('responsive-level-translate-text'),
        $snoozeTime: <HTMLInputElement>document.getElementById('snooze-time'),
        $snoozeTimeText: <HTMLElement>document.getElementById('snooze-time-translate-text'),
        $audio: <HTMLAudioElement>document.getElementById('audio'),
        $goodStatusImage: <HTMLImageElement>document.getElementById('good-status-image'),
        $badStatusImage: <HTMLImageElement>document.getElementById('bad-status-image'),
        stream: null,
        app: null,
    },
    onChangeCheckTime() {
        ipcRenderer.send('onChangeCheckTime')
    },
    onChangeSnoozeTime(snoozeTime) {
        ipcRenderer.send('onChangeSnoozeTime', snoozeTime)
    },
    onChangeResponsiveLevel(responsiveLevel) {
        ipcRenderer.send('onChangeResponsiveLevel', responsiveLevel)
    },
    onChangeLocalstorage() {
        ipcRenderer.send('onChangeLocalstorage')
    },
    onChangeMediaDevice(options) {
        ipcRenderer.send('onChangeMediaDevice', options)
    },
    onAppReady() {
        document.getElementById('loading-wrap').remove()
    },
    setListener() {
        ipcRenderer.on('onChangeStatus', (e, status) => {
            const isGoodStatus = status === LABEL_TYPE.GOOD
            Renderer.data.$goodStatusImage.style.display = isGoodStatus ? 'inline-block' : 'none'
            Renderer.data.$badStatusImage.style.display = isGoodStatus ? 'none' : 'inline-block'
            Renderer.data.$statusText.innerText = status
        })

        ipcRenderer.on('onPlayAlarmSound', () => {
            Renderer.data.$audio.play()
        })

        document
            .getElementById('good-posture')
            .addEventListener('click', () => Renderer.data.app.addModel(LABEL_TYPE.GOOD))

        document
            .getElementById('bad-posture')
            .addEventListener('click', () => Renderer.data.app.addModel(LABEL_TYPE.BAD))

        document.getElementById('clear-posture').addEventListener('click', () => {
            Renderer.data.app.clearModel()
        })

        document.getElementById('responsive-level').addEventListener('change', (e) => {
            const {value} = e.target as HTMLInputElement
            localStorage.setItem('responsiveLevel', value)
            Renderer.data.$responsiveLevelText.innerText = `${value}/10`
            Renderer.onChangeResponsiveLevel(+value)
        })

        document.getElementById('snooze-time').addEventListener('change', (e) => {
            const {value} = e.target as HTMLInputElement
            localStorage.setItem('snoozeTime', value)
            Renderer.data.$snoozeTimeText.innerText = translateTimeStamp(+value)
            Renderer.onChangeSnoozeTime(+value)
        })

        document.getElementById('check-time').addEventListener('change', (e) => {
            const {value} = e.target as HTMLInputElement
            localStorage.setItem('checkTime', value)
            Renderer.data.$checkTimeText.innerText = value
            Renderer.onChangeCheckTime()
        })
    },
    async init() {
        Renderer.manual()
        await Renderer.initCamera()
        Renderer.setListener()
        Renderer.data.app = new App()
    },

    manual() {
        const isFirst = localStorage.getItem('isFirst') === null
        document.getElementById('start-btn').addEventListener('click', () => {
            localStorage.setItem('isFirst', 'false')
            document.getElementById('manual-wrap').style.display = 'none'
        })
        if (isFirst) {
            document.getElementById('manual-wrap').style.display = 'block'
        }
    },

    // 카메라 관리
    async initCamera() {
        const createWebcamSelectOption = async () => {
            let index = 0
            const deviceList = await navigator.mediaDevices.enumerateDevices()
            deviceList.forEach((device) => {
                if (device.kind === 'videoinput') {
                    const $option = document.createElement('option')
                    $option.value = device.deviceId
                    $option.text = device.label || `카메라 ${++index}`
                    Renderer.data.$videoSelect.appendChild($option)
                }
            })
        }

        const getWebcamStream = async () => {
            if (Renderer.data.stream) {
                Renderer.data.stream.getTracks().forEach((track: {stop: () => void}) => {
                    track.stop()
                })
            }
            const videoSource = Renderer.data.$videoSelect.value
            const options = {
                video: {deviceId: videoSource ? {exact: videoSource} : undefined},
            }
            const stream = await navigator.mediaDevices.getUserMedia(options)
            Renderer.data.$videoElement.srcObject = stream
            Renderer.data.stream = stream
            Renderer.onChangeMediaDevice(options)
        }

        try {
            Renderer.data.$videoSelect.addEventListener('change', getWebcamStream)
            await createWebcamSelectOption()
            await getWebcamStream()
        } catch (err) {
            CustomError.dispatch(err)
        }
    },
}

class App {
    classifier: knnClassifier.KNNClassifier

    net: mobilenet.MobileNet

    constructor() {
        this.init()
    }

    async init() {
        this.net = await mobilenet.load()
        this.classifier = knnClassifier.create()
        this.initCheckTime()
        this.initResponsiveLevel()
        this.initSnoozeTime()
        this.tensorLoad()
        Renderer.onAppReady()
    }

    initCheckTime() {
        const checkTime = localStorage.getItem('checkTime') || `${CONFIG.CHECK_TIME}`
        Renderer.data.$checkTime.value = checkTime
        Renderer.data.$checkTimeText.innerText = checkTime
    }

    initResponsiveLevel() {
        const responsiveLevel = localStorage.getItem('responsiveLevel') || `${CONFIG.RESPONSIVE_LEVEL}`
        Renderer.data.$responsiveLevel.value = responsiveLevel
        Renderer.data.$responsiveLevelText.innerText = `${responsiveLevel}/10`
    }

    initSnoozeTime() {
        const snoozeTime = localStorage.getItem('snoozeTime') || `${CONFIG.SNOOZE_TIME}`
        Renderer.data.$snoozeTime.value = `${snoozeTime}`
        Renderer.data.$snoozeTimeText.innerText = translateTimeStamp(+snoozeTime)
        Renderer.onChangeSnoozeTime(+snoozeTime)
    }

    // 텐서 데이터 로드
    tensorLoad() {
        const t1Data = localStorage.getItem('t1Data')
        const t1Shape = localStorage.getItem('t1Shape')
        const t1DType = localStorage.getItem('t1DType')
        const t2Data = localStorage.getItem('t2Data')
        const t2Shape = localStorage.getItem('t2Shape')
        const t2DType = localStorage.getItem('t2DType')
        if (t1Data && t1Shape && t1DType && t2Data && t2Shape && t2DType) {
            try {
                this.classifier.setClassifierDataset({
                    [LABEL_TYPE.GOOD]: tf.tensor(
                        t1Data.split(',').map((item) => +item),
                        [+t1Shape.split(',')[0], +t1Shape.split(',')[1]],
                        t1DType as dType,
                    ),
                    [LABEL_TYPE.BAD]: tf.tensor(
                        t2Data.split(',').map((item) => +item),
                        [+t2Shape.split(',')[0], +t2Shape.split(',')[1]],
                        t2DType as dType,
                    ),
                })
            } catch (error) {
                this.clearModel()
            }
        }
    }

    // 텐서 데이터 저장
    tensorSave() {
        const dataSet = this.classifier.getClassifierDataset()

        if (dataSet[LABEL_TYPE.GOOD]) {
            const t1Data = dataSet[LABEL_TYPE.GOOD].dataSync()
            const t1Shape = dataSet[LABEL_TYPE.GOOD].shape
            const t1DType = dataSet[LABEL_TYPE.GOOD].dtype
            localStorage.setItem('t1Data', t1Data.toString())
            localStorage.setItem('t1Shape', t1Shape.toString())
            localStorage.setItem('t1DType', t1DType)
        }
        if (dataSet[LABEL_TYPE.BAD]) {
            const t2Data = dataSet[LABEL_TYPE.BAD].dataSync()
            const t2Shape = dataSet[LABEL_TYPE.BAD].shape
            const t2DType = dataSet[LABEL_TYPE.BAD].dtype
            localStorage.setItem('t2Data', t2Data.toString())
            localStorage.setItem('t2Shape', t2Shape.toString())
            localStorage.setItem('t2DType', t2DType)
        }
        Renderer.onChangeLocalstorage()
    }

    typingAnimation(classId: string) {
        Renderer.data.$consoleText.innerText = `${classId} 이미지 추가`
        Renderer.data.$consoleText.className = 'console-text'
        setTimeout(() => {
            Renderer.data.$consoleText.className = 'console-text typing-animation'
        }, 1)
    }

    public async addModel(classId: string) {
        if (checkLocalStorageSpace()) {
            const img = tf.browser.fromPixels(Renderer.data.$videoElement)
            this.classifier.addExample(this.net.infer(img, true), classId)
            img.dispose()
            this.typingAnimation(classId)
            this.tensorSave()
        } else {
            console.log('스토리지 꽉찼다.')
        }
    }

    // 모델 삭제
    public clearModel() {
        Promise.resolve().then(() => {
            this.classifier.dispose()
            this.classifier = knnClassifier.create()
            Renderer.data.$consoleText.innerText = ''
            Renderer.data.$statusText.innerText = ''
            localStorage.clear()
            Renderer.onChangeLocalstorage()
        })
    }
}

export default Renderer
