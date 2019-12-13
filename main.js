'use strict';

let N = 512;        // image size (width and height)

let renderer;       // WebGLRenderer
let ctx      = [];  // canvas contexts
let mfscv    = [];  // ShaderMaterial for canvas
let mfs      = [];  // ShaderMaterial for texture
let mfsd;           // ShaderMaterial for drawing texture
let tex      = [];  // textures
let texd     = [];  // textures for drawing

// renderer
let canvas = document.createElement('canvas');
let context = canvas.getContext('webgl2', {alpha: false});
renderer = new THREE.WebGLRenderer({canvas: canvas, context: context});
renderer.setSize(N, N);

// textures
var options = {
    type: THREE.FloatType,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
};
// tex[0]
tex.push(new THREE.WebGLRenderTarget(N, N, options));
// tex[1]
tex.push([
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
]);
// tex[2]
tex.push(new THREE.WebGLRenderTarget(N, N, options));
// tex[3]
tex.push([
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
]);
// texd
texd = [
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
];

// prepare shader materials
let createShaderMaterial = function(fsname, uniform) {
    return new THREE.ShaderMaterial({
        vertexShader: document.getElementById('vs').textContent.trim(),
        fragmentShader: document.getElementById(fsname).textContent.trim(),
        uniforms: uniform,
    })
}
let uniforms = {
    N:          {type: 'i',  value: N},
    itr:        {type: 'i',  value: 1},
    d:          {type: 'v2', value: new THREE.Vector2(1.0/N, 1.0/N)},
    ta:         {type: 't',  value: undefined},
    tb:         {type: 't',  value: undefined},
    b_active:   {type: 'i',  value: 0},
    b_xy:       {type: 'v2', value: new THREE.Vector2(0.0, 0.0)},
    b_type:     {type: 'i',  value: 1},
    b_shape:    {type: 'i',  calue: 0},
    b_r:        {type: 'f',  value: 0.02},
    b_v:        {type: 'f',  value: 0.0},
};
for(let i=0;i<4;i++){
    mfscv.push(createShaderMaterial('fscv'+i, uniforms));
    mfs.push(createShaderMaterial('fs'+i, uniforms));
}
mfsd = createShaderMaterial('fsd', uniforms);


let scene    = new THREE.Scene();
let camera   = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);

camera.position.z = 1;
scene.add(camera)

let plane = new THREE.PlaneGeometry(1.0, 1.0);
let mesh  = new THREE.Mesh(plane);
scene.add(mesh);

var app = new Vue({
    el: '.app',
    data: {
        imageURL: 'image/lena.png',
        uniforms: uniforms,
        styleN: 512,
        ping: 0,        // TODO
        dofft: true,    // TODO
    }, 
    mounted: function () {
        // prepare renderer
        for(let i=0;i<4;i++){
            let cv = document.getElementById('cv'+i);
            cv.width  = N;
            cv.height = N;
            cv.style.width  = this.styleN;
            cv.style.height = this.styleN;
            ctx.push(cv.getContext('2d'));
        }

        this.loadImage();
    },
    methods: {
        mouseDown: function(e) {
            this.uniforms.b_active.value = 1;
            switch(e.button) {
                case 0:
                    this.uniforms.b_type.value = 1;
                    break;
                case 2:
                    this.uniforms.b_type.value = 2;
                    break;
                default:
                    this.uniforms.b_type.value = 1;
            }
            this.dofft = true;
            window.requestAnimationFrame(this.animation);
        },
        clear: function() {
            this.uniforms.b_type.value = 3;
            window.requestAnimationFrame(this.animation);
        },
        wheel: function(e) {

            e.preventDefault();

            let b_r = Number.parseFloat(this.uniforms.b_r.value);
            if(e.deltaY > 0){
                b_r += b_r*0.1;
            }else{
                b_r -= b_r*0.1;
            }

            b_r = Math.min(Math.max(b_r, 0.001), 0.3);
            b_r = Math.round(b_r*1000)/1000;

            this.uniforms.b_r.value = b_r;
        },
        mouseUp: function() {
            this.uniforms.b_active.value = 0;
        },
        mouseMove: function(e) {
            this.uniforms.b_xy.value.x = e.offsetX/this.styleN;
            this.uniforms.b_xy.value.y = 1.0-e.offsetY/this.styleN;

            if(this.uniforms.b_active.value){
                this.dofft = true;
                window.requestAnimationFrame(this.animation);
            }
        },
        loadImage: function() {
            var loader = new THREE.TextureLoader();
            loader.load(
                this.imageURL,
                // onLoad callback
                this.init,
                // onProgress callback currently not supported
                undefined,
                // onError callback
                function() {
                    console.error('Load Error');
                }
            );
        },
        init: function(texture) {
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            tex[0].texture = texture;

            // phase 0
            // render to tex[1][0];
            mesh.material = mfs[0];
            uniforms.ta.value = tex[0].texture;
            renderer.setRenderTarget(tex[1][0]);
            renderer.render(scene, camera)

            // render to canvas
            mesh.material = mfscv[0];
            uniforms.ta.value = tex[0].texture;
            renderer.setRenderTarget(null);
            renderer.render(scene, camera)
            ctx[0].drawImage(renderer.domElement, 0, 0);


            // phase 1
            // forward Fourier transform
            mesh.material = mfs[1];
            let ping = 0;
            for(let itr=2;itr<=N;itr*=2){ // TODO rename itr
                uniforms.ta.value = tex[1][ping].texture;
                uniforms.itr.value = itr;
                renderer.setRenderTarget(tex[1][1-ping]);
                renderer.render(scene, camera)
                ping = 1-ping;
            }
            renderer.setRenderTarget(tex[1][2]);
            renderer.render(scene, camera)

            // render to canvas
            mesh.material = mfscv[1];
            uniforms.ta.value = tex[1][2].texture;
            renderer.setRenderTarget(null);
            renderer.render(scene, camera)
            ctx[1].drawImage(renderer.domElement, 0, 0);

            this.dofft = true;
            this.uniforms.b_type.value = 3; // clear mask

            window.requestAnimationFrame(this.animation);
        },
        animation: function() {
            // drawings
            mesh.material = mfsd;
            let flag = false;
            if(this.uniforms.b_type.value == 3){
                flag = true;
            }
            if(flag || this.uniforms.b_active){
                uniforms.ta.value = texd[this.ping].texture;
                renderer.setRenderTarget(texd[1-this.ping]);
                renderer.render(scene, camera)
                this.ping = 1-this.ping;
                if(flag){
                    this.uniforms.b_type.value = 1;
                }

                // phase 2
                // merge drawings
                mesh.material = mfs[2];
                uniforms.ta.value = tex[1][2].texture;
                uniforms.tb.value = texd[this.ping].texture;
                renderer.setRenderTarget(tex[3][0]);
                renderer.render(scene, camera)

                // render to canvas
                mesh.material = mfscv[2];
                uniforms.ta.value = tex[1][2].texture;
                uniforms.tb.value = texd[this.ping].texture;
                renderer.setRenderTarget(null);
                renderer.render(scene, camera)
                ctx[2].drawImage(renderer.domElement, 0, 0);
            }


            // phase 3
            // backward Fourier transform
            if(this.dofft){
                mesh.material = mfs[3];
                var ping = 0;
                for(let itr=2;itr<=N;itr*=2){ // TODO rename itr
                    uniforms.ta.value = tex[3][ping].texture;
                    uniforms.itr.value = itr;
                    renderer.setRenderTarget(tex[3][1-ping]);
                    renderer.render(scene, camera)
                    ping = 1-ping;
                }

                // render to canvas
                mesh.material = mfscv[3];
                uniforms.ta.value = tex[3][ping].texture;
                renderer.setRenderTarget(null);
                renderer.render(scene, camera)
                ctx[3].drawImage(renderer.domElement, 0, 0);

                this.dofft = false;
            }
        },
    },
});
