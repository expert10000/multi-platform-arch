package com.dzone.platform;

import com.dzone.platform.PlatformModels.ProcessingJob;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class JobWorker {
  private final PlatformStore store;

  public JobWorker(PlatformStore store) {
    this.store = store;
  }

  @Scheduled(fixedDelay = 250)
  void processQueuedJobs() {
    ProcessingJob job = store.nextQueuedJob();
    if (job == null) {
      return;
    }
    store.updateJobStatus(job.id(), "running");
    store.updateJobStatus(job.id(), "completed");
  }
}

