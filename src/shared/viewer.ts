import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { v3, type Vec3 } from './heart';

export interface Viewer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Current canvas size in CSS pixels. */
  size: { width: number; height: number };
  resetView(): void;
  render(): void;
  dispose(): void;
}

export interface ViewerOptions {
  home: Vec3;
  target: Vec3;
  localClipping?: boolean;
  onResize?: () => void;
}

/**
 * Creates the renderer, camera, lights and orbit controls inside `container`.
 * Throws if WebGL is unavailable; callers show a fallback message.
 */
export function createViewer(container: HTMLElement, options: ViewerOptions): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = options.localClipping ?? false;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const home = v3(options.home);
  const target = v3(options.target);
  camera.position.copy(home);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 24;
  controls.update();

  // Physically based light units: legacy intensities scaled by PI.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x40302c, 0.8 * Math.PI));
  const key = new THREE.DirectionalLight(0xffffff, 0.85 * Math.PI);
  key.position.set(5, 8, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35 * Math.PI);
  rim.position.set(-6, -2, -8);
  scene.add(rim);

  const size = { width: 1, height: 1 };
  const resize = (): void => {
    size.width = Math.max(1, container.clientWidth);
    size.height = Math.max(1, container.clientHeight);
    renderer.setSize(size.width, size.height, false);
    camera.aspect = size.width / size.height;
    camera.fov = size.width < 520 ? 46 : 38;
    camera.updateProjectionMatrix();
    options.onResize?.();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    renderer,
    scene,
    camera,
    controls,
    size,
    resetView() {
      camera.position.copy(home);
      controls.target.copy(target);
      controls.update();
    },
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}

export function showFallback(container: HTMLElement, message: string): void {
  const el = document.createElement('div');
  el.className = 'fallback';
  el.textContent = message;
  container.appendChild(el);
}
