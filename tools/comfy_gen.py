"""Генерация текстур через локальный ComfyUI API (RealVisXL Lightning).
Использование: python comfy_gen.py <jobs.json> <out_dir>
jobs.json: [{"name": "grass", "prompt": "...", "neg": "...", "w": 1024, "h": 1024, "seed": 1, "rembg": false}]
"""
import json, sys, time, urllib.request, os, random

API = 'http://127.0.0.1:8189'
CKPT = 'RealVisXL_V5.0_Lightning_fp16.safetensors'
NEG = 'text, watermark, logo, signature, blurry, lowres, frame, border, people, person, cartoon, painting'


def post(path, data):
    req = urllib.request.Request(API + path, json.dumps(data).encode(), {'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())


def get(path):
    return urllib.request.urlopen(API + path).read()


def graph(job):
    g = {
        '1': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': CKPT}},
        '2': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['1', 1], 'text': job['prompt']}},
        '3': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['1', 1], 'text': job.get('neg', '') + ', ' + NEG}},
        '4': {'class_type': 'EmptyLatentImage', 'inputs': {'width': job.get('w', 1024), 'height': job.get('h', 1024), 'batch_size': 1}},
        '5': {'class_type': 'KSampler', 'inputs': {'model': ['1', 0], 'positive': ['2', 0], 'negative': ['3', 0], 'latent_image': ['4', 0],
              'seed': job.get('seed', random.randint(1, 10**9)), 'steps': job.get('steps', 6), 'cfg': job.get('cfg', 1.8),
              'sampler_name': 'dpmpp_sde', 'scheduler': 'karras', 'denoise': 1.0}},
        '6': {'class_type': 'VAEDecode', 'inputs': {'samples': ['5', 0], 'vae': ['1', 2]}},
        '7': {'class_type': 'SaveImage', 'inputs': {'images': ['6', 0], 'filename_prefix': 'sf_' + job['name']}},
    }
    if job.get('rembg'):
        g['8'] = {'class_type': 'LoadBackgroundRemovalModel', 'inputs': {'bg_removal_name': 'birefnet.safetensors'}}
        g['9'] = {'class_type': 'RemoveBackground', 'inputs': {'bg_removal_model': ['8', 0], 'image': ['6', 0]}}
        g['10'] = {'class_type': 'JoinImageWithAlpha', 'inputs': {'image': ['6', 0], 'alpha': ['9', 0]}}
        g['7']['inputs']['images'] = ['10', 0]
    return g


def run(job, out_dir):
    pid = post('/prompt', {'prompt': graph(job)})['prompt_id']
    t0 = time.time()
    while True:
        h = json.loads(get('/history/' + pid))
        if pid in h:
            st = h[pid].get('status', {})
            if st.get('status_str') == 'error':
                raise RuntimeError(json.dumps(st)[:2000])
            outs = h[pid]['outputs']
            for node in outs.values():
                for im in node.get('images', []):
                    data = get(f"/view?filename={im['filename']}&subfolder={im['subfolder']}&type={im['type']}")
                    path = os.path.join(out_dir, job['name'] + '.png')
                    open(path, 'wb').write(data)
                    print(f"{job['name']}: {time.time() - t0:.0f}s -> {path}", flush=True)
                    return path
        time.sleep(1)


if __name__ == '__main__':
    jobs = json.load(open(sys.argv[1], encoding='utf-8'))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    only = sys.argv[3].split(',') if len(sys.argv) > 3 else None
    for j in jobs:
        if only and j['name'] not in only:
            continue
        run(j, out)
