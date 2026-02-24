'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { Analyser } from './analyser';
import { fs as backdropFS, vs as backdropVS } from './backdrop-shader';
import { vs as sphereVS } from './sphere-shader';

interface Props {
  inputNode: AudioNode | null;
  outputNode: AudioNode | null;
}

export default function LiveAudioVisuals3D({ inputNode, outputNode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputAnalyserRef = useRef<Analyser | null>(null);
  const outputAnalyserRef = useRef<Analyser | null>(null);

  useEffect(() => {
    if (inputNode) {
      inputAnalyserRef.current = new Analyser(inputNode);
    }
  }, [inputNode]);

  useEffect(() => {
    if (outputNode) {
      outputAnalyserRef.current = new Analyser(outputNode);
    }
  }, [outputNode]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    let reqId: number;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: { value: new THREE.Vector2(1, 1) },
          rand: { value: 0 },
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(2, -2, 5);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const geometry = new THREE.IcosahedronGeometry(1, 10);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x000010,
      metalness: 0.5,
      roughness: 0.1,
      emissive: 0x000010,
      emissiveIntensity: 1.5,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.inputData = { value: new THREE.Vector4() };
      shader.uniforms.outputData = { value: new THREE.Vector4() };
      sphereMaterial.userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false;

    new THREE.TextureLoader().load('/artwork.png', (texture) => {
      const img = texture.image;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
      }
      const flippedTexture = new THREE.CanvasTexture(canvas);
      flippedTexture.mapping = THREE.EquirectangularReflectionMapping;
      flippedTexture.colorSpace = THREE.SRGBColorSpace;
      const exrCubeRenderTarget =
        pmremGenerator.fromEquirectangular(flippedTexture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
      texture.dispose();
    });

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      5,
      0.5,
      0,
    );

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      (
        backdrop.material as THREE.RawShaderMaterial
      ).uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }
    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    let prevTime = performance.now();
    const rotation = new THREE.Vector3(0, 0, 0);

    function animate() {
      reqId = requestAnimationFrame(animate);

      if (inputAnalyserRef.current) inputAnalyserRef.current.update();
      if (outputAnalyserRef.current) outputAnalyserRef.current.update();

      const t = performance.now();
      const dt = (t - prevTime) / (1000 / 60);
      prevTime = t;

      const backdropMat = backdrop.material as THREE.RawShaderMaterial;
      backdropMat.uniforms.rand.value = Math.random() * 10000;

      if (sphereMaterial.userData.shader) {
        const outData1 = outputAnalyserRef.current
          ? outputAnalyserRef.current.data[1]
          : 0;
        const outData0 = outputAnalyserRef.current
          ? outputAnalyserRef.current.data[0]
          : 0;
        const outData2 = outputAnalyserRef.current
          ? outputAnalyserRef.current.data[2]
          : 0;
        const inData1 = inputAnalyserRef.current
          ? inputAnalyserRef.current.data[1]
          : 0;
        const inData0 = inputAnalyserRef.current
          ? inputAnalyserRef.current.data[0]
          : 0;
        const inData2 = inputAnalyserRef.current
          ? inputAnalyserRef.current.data[2]
          : 0;

        sphere.scale.setScalar(1 + (0.2 * outData1) / 255);

        const f = 0.001;
        rotation.x += (dt * f * 0.5 * outData1) / 255;
        rotation.z += (dt * f * 0.5 * inData1) / 255;
        rotation.y += (dt * f * 0.25 * inData2) / 255;
        rotation.y += (dt * f * 0.25 * outData2) / 255;

        const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z);
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        const vector = new THREE.Vector3(0, 0, 5);
        vector.applyQuaternion(quaternion);
        camera.position.copy(vector);
        camera.lookAt(sphere.position);

        sphereMaterial.userData.shader.uniforms.time.value +=
          (dt * 0.1 * outData0) / 255;
        sphereMaterial.userData.shader.uniforms.inputData.value.set(
          (1 * inData0) / 255,
          (0.1 * inData1) / 255,
          (10 * inData2) / 255,
          0,
        );
        sphereMaterial.userData.shader.uniforms.outputData.value.set(
          (2 * outData0) / 255,
          (0.1 * outData1) / 255,
          (10 * outData2) / 255,
          0,
        );
      }

      composer.render();
    }

    animate();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(reqId);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        imageRendering: 'pixelated',
      }}
    />
  );
}
