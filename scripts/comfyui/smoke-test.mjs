const baseUrl = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188';

async function readJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return response.json();
}

try {
  const [stats, queue, objectInfo] = await Promise.all([
    readJson('/system_stats'),
    readJson('/queue'),
    readJson('/object_info'),
  ]);

  const device = stats.devices?.[0];
  const requiredNodes = ['CheckpointLoaderSimple', 'KSampler', 'SaveImage'];
  const missingNodes = requiredNodes.filter((name) => !objectInfo[name]);

  console.log(JSON.stringify({
    ok: missingNodes.length === 0,
    comfyui: stats.system?.comfyui_version,
    pytorch: stats.system?.pytorch_version,
    device: device?.name,
    queueRunning: queue.queue_running?.length ?? 0,
    queuePending: queue.queue_pending?.length ?? 0,
    nodeClasses: Object.keys(objectInfo).length,
    missingNodes,
  }, null, 2));

  if (missingNodes.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(`ComfyUI smoke test failed: ${error.message}`);
  process.exitCode = 1;
}

