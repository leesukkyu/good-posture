/* eslint-disable no-constant-condition */
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as knnClassifier from '@tensorflow-models/knn-classifier'
import * as electron from 'electron'
import {MODEL_TYPE} from '../ini'
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
        $responsiveLevel: HTMLInputElement
        $responsiveLevelText: HTMLElement
        $videoElement: HTMLVideoElement
        $snoozeTime: HTMLInputElement
        $snoozeTimeText: HTMLElement
        $audio: HTMLAudioElement
        stream: MediaStream
        $goodStatusImage: HTMLImageElement
        $badStatusImage: HTMLImageElement
    }
    init: () => void
    initCamera: () => void
    app: () => void
}

const Renderer: RendererInterface = {
    data: {
        $videoSelect: <HTMLSelectElement>document.getElementById('video-device-select'),
        $consoleText: <HTMLElement>document.getElementById('console-text'),
        $statusText: <HTMLElement>document.getElementById('status-text'),
        $videoElement: <HTMLVideoElement>document.getElementById('video'),
        $responsiveLevel: <HTMLInputElement>document.getElementById('responsive-level'),
        $responsiveLevelText: <HTMLElement>document.getElementById('responsive-level-translate-text'),
        $snoozeTime: <HTMLInputElement>document.getElementById('snooze-time'),
        $snoozeTimeText: <HTMLElement>document.getElementById('snooze-time-translate-text'),
        $audio: <HTMLAudioElement>document.getElementById('audio'),
        $goodStatusImage: <HTMLImageElement>document.getElementById('good-status-image'),
        $badStatusImage: <HTMLImageElement>document.getElementById('bad-status-image'),
        stream: null,
    },
    async init() {
        await Renderer.initCamera()
        await Renderer.app()
        ipcRenderer.on('onChangeStatus', (e, status) => {
            const isGoodStatus = status === MODEL_TYPE.GOOD
            Renderer.data.$goodStatusImage.style.display = isGoodStatus ? 'inline-block' : 'none'
            Renderer.data.$badStatusImage.style.display = isGoodStatus ? 'none' : 'inline-block'
            Renderer.data.$statusText.innerText = status
        })
        ipcRenderer.on('onPlayAlarmSound', () => {
            Renderer.data.$audio.play()
        })

        document.getElementById('loading-wrap').remove()
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
            ipcRenderer.send('onChangeMediaDevice', options)
        }

        try {
            Renderer.data.$videoSelect.addEventListener('change', getWebcamStream)
            await createWebcamSelectOption()
            await getWebcamStream()
        } catch (err) {
            CustomError.dispatch(err)
        }
    },

    // 텐서플로 관리
    async app() {
        let classifier: knnClassifier.KNNClassifier = knnClassifier.create()

        const net = await mobilenet.load()

        const onChangeLocalstorage = () => {
            ipcRenderer.send('onChangeLocalstorage')
        }

        const onChangeResponsiveLevel = (responsiveLevel) => {
            ipcRenderer.send('onChangeResponsiveLevel', responsiveLevel)
        }

        const onChangeSnoozeTime = (snoozeTime) => {
            ipcRenderer.send('onChangeSnoozeTime', snoozeTime)
        }

        // 텐서 데이터 저장
        const tensorSave = () => {
            const dataSet = classifier.getClassifierDataset()

            if (dataSet[MODEL_TYPE.GOOD]) {
                const t1Data = dataSet[MODEL_TYPE.GOOD].dataSync()
                const t1Shape = dataSet[MODEL_TYPE.GOOD].shape
                const t1DType = dataSet[MODEL_TYPE.GOOD].dtype
                localStorage.setItem('t1Data', t1Data.toString())
                localStorage.setItem('t1Shape', t1Shape.toString())
                localStorage.setItem('t1DType', t1DType)
            }
            if (dataSet[MODEL_TYPE.BAD]) {
                const t2Data = dataSet[MODEL_TYPE.BAD].dataSync()
                const t2Shape = dataSet[MODEL_TYPE.BAD].shape
                const t2DType = dataSet[MODEL_TYPE.BAD].dtype
                localStorage.setItem('t2Data', t2Data.toString())
                localStorage.setItem('t2Shape', t2Shape.toString())
                localStorage.setItem('t2DType', t2DType)
            }
            onChangeLocalstorage()
        }

        // 텐서 데이터 로드
        const tensorLoad = () => {
            const t1Data = localStorage.getItem('t1Data')
            const t1Shape = localStorage.getItem('t1Shape')
            const t1DType = localStorage.getItem('t1DType')
            const t2Data = localStorage.getItem('t2Data')
            const t2Shape = localStorage.getItem('t2Shape')
            const t2DType = localStorage.getItem('t2DType')
            if (t1Data && t1Shape && t1DType && t2Data && t2Shape && t2DType) {
                try {
                    classifier.setClassifierDataset({
                        [MODEL_TYPE.GOOD]: tf.tensor(
                            t1Data.split(',').map((item) => +item),
                            [+t1Shape.split(',')[0], +t1Shape.split(',')[1]],
                            t1DType as dType,
                        ),
                        [MODEL_TYPE.BAD]: tf.tensor(
                            t2Data.split(',').map((item) => +item),
                            [+t2Shape.split(',')[0], +t2Shape.split(',')[1]],
                            t2DType as dType,
                        ),
                    })
                } catch (error) {
                    clearModel()
                }
            }
        }

        // 모델 추가
        const addModel = async (classId: string) => {
            if (checkLocalStorageSpace()) {
                const img = tf.browser.fromPixels(Renderer.data.$videoElement)
                const activation = net.infer(img, true)
                classifier.addExample(activation, classId)
                img.dispose()
                Renderer.data.$consoleText.innerText = `${classId} 이미지 추가`
                Renderer.data.$consoleText.className = 'console-text'
                setTimeout(() => {
                    Renderer.data.$consoleText.className = 'console-text typing-animation'
                }, 1)
                tensorSave()
            } else {
                console.log('스토리지 꽉찼다.')
            }
        }

        // 모델 삭제
        const clearModel = () => {
            Promise.resolve().then(() => {
                classifier.dispose()
                classifier = knnClassifier.create()
                Renderer.data.$consoleText.innerText = ''
                Renderer.data.$statusText.innerText = ''
                localStorage.clear()
                onChangeLocalstorage()
            })
        }

        // 리스너 설정
        const addEventListener = () => {
            document.getElementById('good-posture').addEventListener('click', () => addModel(MODEL_TYPE.GOOD))
            document.getElementById('bad-posture').addEventListener('click', () => addModel(MODEL_TYPE.BAD))
            document.getElementById('clear-posture').addEventListener('click', () => {
                clearModel()
            })
            document.getElementById('responsive-level').addEventListener('change', (e) => {
                const {value} = e.target as HTMLInputElement
                localStorage.setItem('responsiveLevel', value)
                Renderer.data.$responsiveLevelText.innerText = `${value}/10`
                onChangeResponsiveLevel(value)
            })
            document.getElementById('snooze-time').addEventListener('change', (e) => {
                const {value} = e.target as HTMLInputElement
                localStorage.setItem('snoozeTime', value)
                Renderer.data.$snoozeTimeText.innerText = translateTimeStamp(+value)
                onChangeSnoozeTime(value)
            })
        }

        // 초기 민감도 세팅
        const initResponsiveLevel = () => {
            const responsiveLevel = localStorage.getItem('responsiveLevel') || '7'
            Renderer.data.$responsiveLevel.value = responsiveLevel
            Renderer.data.$responsiveLevelText.innerText = `${responsiveLevel}/10`
        }

        // 초기 스누즈 세팅
        const initSnoozeTime = () => {
            const snoozeTime = localStorage.getItem('snoozeTime') || '60'
            Renderer.data.$snoozeTime.value = snoozeTime
            Renderer.data.$snoozeTimeText.innerText = translateTimeStamp(+snoozeTime)
            onChangeSnoozeTime(snoozeTime)
        }

        initResponsiveLevel()
        initSnoozeTime()
        tensorLoad()
        addEventListener()

        let count = 0
        const test = () => {
            console.log(count++)
            requestAnimationFrame(test)
        }
        requestAnimationFrame(test)
    },
}

export default Renderer
