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

        const net = await mobilenet.load()

        const getImageFromWebcam = () => {
            return tf.browser.fromPixels(Renderer.data.$webcamElement)
        }

        const save = () => {
            const dataSet = classifier.getClassifierDataset()

            if (dataSet['좋은 자세']) {
                const t1Data = dataSet['좋은 자세'].dataSync()
                const t1Shape = dataSet['좋은 자세'].shape
                const t1DType = dataSet['좋은 자세'].dtype
                localStorage.setItem('t1Data', t1Data.toString())
                localStorage.setItem('t1Shape', t1Shape.toString())
                localStorage.setItem('t1DType', t1DType)
            }
            if (dataSet['나쁜 자세']) {
                const t2Data = dataSet['나쁜 자세'].dataSync()
                const t2Shape = dataSet['나쁜 자세'].shape
                const t2DType = dataSet['나쁜 자세'].dtype
                localStorage.setItem('t2Data', t2Data.toString())
                localStorage.setItem('t2Shape', t2Shape.toString())
                localStorage.setItem('t2DType', t2DType)
            }
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
                        '좋은 자세': tf.tensor(
                            t1Data.split(',').map((item) => +item),
                            [+t1Shape.split(',')[0], +t1Shape.split(',')[1]],
                            t1DType as 'string' | 'float32' | 'int32' | 'bool' | 'complex64',
                        ),
                        '나쁜 자세': tf.tensor(
                            t2Data.split(',').map((item) => +item),
                            [+t2Shape.split(',')[0], +t2Shape.split(',')[1]],
                            t2DType as 'string' | 'float32' | 'int32' | 'bool' | 'complex64',
                        ),
                    })
                } catch (error) {
                    clearModel()
                }
            }
        }

        const addModel = async (classId: string) => {
            const img = getImageFromWebcam()
            const activation = net.infer(img, true)
            classifier.addExample(activation, classId)
            img.dispose()
            document.getElementById('console').innerText += `${classId} 이미지 추가\n`
            save()
        }

        const clearModel = () => {
            Promise.resolve().then(() => {
                classifier.dispose()
                classifier = knnClassifier.create()
                Renderer.data.$console.innerText = ''
                Renderer.data.$resultBox.innerText = ''
                localStorage.clear()
            })
        }

        const addEventListener = () => {
            document.getElementById('good-posture').addEventListener('click', () => addModel('좋은 자세'))
            document.getElementById('bad-posture').addEventListener('click', () => addModel('나쁜 자세'))
            document.getElementById('clear-posture').addEventListener('click', () => {
                clearModel()
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

        load()
        addEventListener()
        window.requestAnimationFrame(loop)
    },
}

Renderer.init()
