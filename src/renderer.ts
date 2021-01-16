/* eslint-disable no-constant-condition */
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as knnClassifier from '@tensorflow-models/knn-classifier'
import * as electron from 'electron'
import './index.scss'

const {ipcRenderer} = electron

interface RendererInterface {
    data: {
        $console: HTMLElement
        $resultBox: HTMLElement
        $webcamElement: HTMLVideoElement
        stream
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
        window.addEventListener('err', function (e: CustomEvent) {
            console.log(e.detail)
        })
        ipcRenderer.on('onChangeCameraAuth', (e: electron.IpcRendererEvent, cameraAuth: boolean) => {
            if (cameraAuth) {
                Renderer.initCamera()
                Renderer.app()
            }
        })
    },

    // 카메라 관리
    async initCamera() {
        const $videoSelect = <HTMLSelectElement>document.getElementById('video-device-select')

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
        }

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

        try {
            $videoSelect.addEventListener('change', getWebcamStream)
            await createWebcamSelectOption()
            await getWebcamStream()
        } catch (err) {
            window.dispatchEvent(new CustomEvent('err', {detail: err}))
        }
    },

    // 텐서플로 관리
    async app() {
        let classifier: knnClassifier.KNNClassifier = knnClassifier.create()

        const getImageFromWebcam = () => {
            return tf.browser.fromPixels(Renderer.data.$webcamElement)
        }

        const net = await mobilenet.load()

        const addModel = async (classId: string) => {
            const img = getImageFromWebcam()
            const activation = net.infer(img, true)
            classifier.addExample(activation, classId)
            img.dispose()
            document.getElementById('console').innerText += `${classId} 이미지 추가\n`
        }

        const addEventListener = () => {
            document.getElementById('good-posture').addEventListener('click', () => addModel('좋은 자세'))
            document.getElementById('bad-posture').addEventListener('click', () => addModel('나쁜 자세'))
            document.getElementById('clear-posture').addEventListener('click', () => {
                Promise.resolve().then(() => {
                    classifier.dispose()
                    classifier = knnClassifier.create()
                    Renderer.data.$console.innerText = ''
                    Renderer.data.$resultBox.innerText = ''
                })
            })
        }

        const resultCheck = (result) => {
            console.log(result.confidences[result.label])
            return result.label === '나쁜 자세'
        }

        const loop = async () => {
            if (classifier.getNumClasses() > 0) {
                const img = getImageFromWebcam()

                const activation = net.infer(img, true)
                const result = await classifier.predictClass(activation)
                Renderer.data.$resultBox.innerText = `현재 자세: ${result.label}\n`
                if (resultCheck(result)) {
                    ipcRenderer.send('notification')
                }
                img.dispose()
            }
            window.requestAnimationFrame(loop)
        }

        addEventListener()
        window.requestAnimationFrame(loop)
    },
}

Renderer.init()
