/* eslint-disable no-constant-condition */
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as knnClassifier from '@tensorflow-models/knn-classifier'
import * as electron from 'electron'
import {MODEL_TYPE} from '../ini'
import {checkLocalStorageSpace} from './util'
import CustomError from './error'
import '../styles/index.scss'

const {ipcRenderer} = electron

type dType = 'string' | 'float32' | 'int32' | 'bool' | 'complex64'

interface RendererInterface {
    data: {
        $console: HTMLElement
        $resultBox: HTMLElement
        $webcamElement: HTMLVideoElement
        stream: MediaStream
    }
    init: () => void
    initCamera: () => void
    app: () => void
}

const Renderer: RendererInterface = {
    data: {
        $console: <HTMLElement>document.getElementById('console'),
        $resultBox: <HTMLElement>document.getElementById('result-box'),
        $webcamElement: <HTMLVideoElement>document.getElementById('webcam'),
        stream: null,
    },
    init() {
        Renderer.initCamera()
        Renderer.app()
    },

    // 카메라 관리
    async initCamera() {
        const $videoSelect = <HTMLSelectElement>document.getElementById('video-device-select')

        const createWebcamSelectOption = async () => {
            let index = 0
            const deviceList = await navigator.mediaDevices.enumerateDevices()
            deviceList.forEach((device) => {
                if (device.kind === 'videoinput') {
                    const $option = document.createElement('option')
                    $option.value = device.deviceId
                    $option.text = device.label || `카메라 ${++index}`
                    $videoSelect.appendChild($option)
                }
            })
        }

        const getWebcamStream = async () => {
            if (Renderer.data.stream) {
                Renderer.data.stream.getTracks().forEach((track: {stop: () => void}) => {
                    track.stop()
                })
            }
            const videoSource = $videoSelect.value
            const options = {
                video: {deviceId: videoSource ? {exact: videoSource} : undefined},
            }
            const stream = await navigator.mediaDevices.getUserMedia(options)
            Renderer.data.$webcamElement.srcObject = stream
            Renderer.data.stream = stream
            ipcRenderer.send('onChangeMediaDevice', options)
        }

        try {
            $videoSelect.addEventListener('change', getWebcamStream)
            await createWebcamSelectOption()
            await getWebcamStream()
        } catch (err) {
            CustomError.dispatch(err)
        }
    },

    // 텐서플로 관리
    async app() {
        let classifier: knnClassifier.KNNClassifier = knnClassifier.create()

        let responsiveLevel

        const net = await mobilenet.load()

        const getImageFromWebcam = () => {
            return tf.browser.fromPixels(Renderer.data.$webcamElement)
        }

        const changeLocalstorage = () => {
            ipcRenderer.send('onChangeLocalstorage')
        }

        const save = () => {
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
            changeLocalstorage()
        }

        const load = () => {
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

        const addModel = async (classId: string) => {
            if (checkLocalStorageSpace()) {
                const img = getImageFromWebcam()
                const activation = net.infer(img, true)
                classifier.addExample(activation, classId)
                img.dispose()
                document.getElementById('console').innerText += `${classId} 이미지 추가\n`
                save()
            } else {
                console.log('스토리지 꽉찼다.')
            }
        }

        const clearModel = () => {
            Promise.resolve().then(() => {
                classifier.dispose()
                classifier = knnClassifier.create()
                Renderer.data.$console.innerText = ''
                Renderer.data.$resultBox.innerText = ''
                localStorage.clear()
                changeLocalstorage()
            })
        }

        const addEventListener = () => {
            document.getElementById('good-posture').addEventListener('click', () => addModel(MODEL_TYPE.GOOD))
            document.getElementById('bad-posture').addEventListener('click', () => addModel(MODEL_TYPE.BAD))
            document.getElementById('clear-posture').addEventListener('click', () => {
                clearModel()
            })
            document.getElementById('responsive-level').addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement
                localStorage.setItem('responsiveLevel', target.value)
                responsiveLevel = target.value
                document.getElementById('responsive-level-translate').innerText = `${target.value}/10`
                ipcRenderer.send('onChangeResponsiveLevel', target.value)
            })
            document.getElementById('snooze-time').addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement
                localStorage.setItem('snoozeTime', target.value)
                document.getElementById('snooze-time-translate').innerText = `${Math.floor(+target.value / 60)}분 ${
                    +target.value % 60
                }초`
                ipcRenderer.send('onChangeSnoozeTime', target.value)
            })
        }

        const setResponsiveLevel = () => {
            responsiveLevel = localStorage.getItem('responsiveLevel')
            responsiveLevel = responsiveLevel ? responsiveLevel : '7'
            const target = document.getElementById('responsive-level') as HTMLInputElement
            target.value = responsiveLevel
            document.getElementById('responsive-level-translate').innerText = `${responsiveLevel}/10`
        }

        const setSnoozeTime = () => {
            let localSnoozeTime = localStorage.getItem('snoozeTime')
            localSnoozeTime = localSnoozeTime ? localSnoozeTime : '60'
            const target = document.getElementById('snooze-time') as HTMLInputElement
            target.value = localSnoozeTime
            document.getElementById('snooze-time-translate').innerText = `${Math.floor(+localSnoozeTime / 60)}분 ${
                +localSnoozeTime % 60
            }초`
            ipcRenderer.send('onChangeSnoozeTime', localSnoozeTime)
        }

        setResponsiveLevel()
        setSnoozeTime()
        load()
        addEventListener()

        const resultCheck = (result) => {
            const isBad = result.label === MODEL_TYPE.BAD
            console.log(responsiveLevel / 10)
            console.log(result.confidences[result.label])
            if (!isBad) {
                return false
            }
            return responsiveLevel / 10 < result.confidences[result.label]
        }

        while (true) {
            if (classifier.getNumClasses() > 0) {
                const img = getImageFromWebcam()
                const activation = net.infer(img, true)
                const result = await classifier.predictClass(activation)
                Renderer.data.$resultBox.innerText = `현재 자세: ${resultCheck(result) ? '나쁜 자세' : '좋은 자세'}\n`
                img.dispose()
            }
            await tf.nextFrame()
        }
    },
}

export default Renderer
