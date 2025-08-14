import { GainForestArchiver } from '../../src/app';
import { loadConfig } from '../../src/config/environment';
import { performance } from 'perf_hooks';

describe('Performance Tests', () => {
  let archiver: GainForestArchiver;

  beforeAll(async () => {
    const config = loadConfig();
    archiver = new GainForestArchiver(config);
    await archiver.initialize();
  });

  afterAll(async () => {
    if (archiver) {
      await archiver.shutdown();
    }
  });

  it('should process ecocerts within acceptable time limits', async () => {
    const startTime = performance.now();
    
    const ecocertIds = archiver['ecocertService'].getSampleEcocertIds().slice(0, 3);
    await archiver.processSpecificEcocerts(ecocertIds);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(60000);
    
    console.log(`Processed ${ecocertIds.length} ecocerts in ${duration.toFixed(2)}ms`);
    console.log(`Average time per ecocert: ${(duration / ecocertIds.length).toFixed(2)}ms`);
  }, 90000);

  it('should handle concurrent processing efficiently', async () => {
    const startTime = performance.now();
    
    const ecocertIds = archiver['ecocertService'].getSampleEcocertIds().slice(0, 5);
    const promises = ecocertIds.map(id => 
      archiver.processSpecificEcocerts([id])
    );
    
    await Promise.all(promises);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`Concurrent processing of ${ecocertIds.length} ecocerts: ${duration.toFixed(2)}ms`);
    
    expect(duration).toBeLessThan(120000);
  }, 150000);

  it('should maintain memory usage within limits', async () => {
    const initialMemory = process.memoryUsage();
    
    const ecocertIds = archiver['ecocertService'].getSampleEcocertIds().slice(0, 5);
    
    for (const id of ecocertIds) {
      await archiver.processSpecificEcocerts([id]);
      
      if (global.gc) {
        global.gc();
      }
    }
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
  });
});