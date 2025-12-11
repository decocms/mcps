  /**
   * Write a value to a stream.
   * @param key - The stream key/name within the workflow
   * @param value - A serializable value to write to the stream
   */
  static async writeStream<T>(key: string, value: T): Promise<void> {
    ensureDBOSIsLaunched('writeStream');
    if (DBOS.isWithinWorkflow()) {
      if (DBOS.isInWorkflow()) {
        const functionID: number = functionIDGetIncrement();
        return await DBOSExecutor.globalInstance!.systemDatabase.writeStreamFromWorkflow(
          DBOS.workflowID!,
          functionID,
          key,
          value,
        );
      } else if (DBOS.isInStep()) {
        return await DBOSExecutor.globalInstance!.systemDatabase.writeStreamFromStep(DBOS.workflowID!, key, value);
      } else {
        throw new DBOSInvalidWorkflowTransitionError(
          'Invalid call to `DBOS.writeStream` outside of a workflow or step',
        );
      }
    } else {
      throw new DBOSInvalidWorkflowTransitionError('Invalid call to `DBOS.writeStream` outside of a workflow or step');
    }
  }

  /**
   * Close a stream by writing a sentinel value.
   * @param key - The stream key/name within the workflow
   */
  static async closeStream(key: string): Promise<void> {
    ensureDBOSIsLaunched('closeStream');
    if (DBOS.isWithinWorkflow()) {
      if (DBOS.isInWorkflow()) {
        const functionID: number = functionIDGetIncrement();
        return await DBOSExecutor.globalInstance!.systemDatabase.closeStream(DBOS.workflowID!, functionID, key);
      } else {
        throw new DBOSInvalidWorkflowTransitionError(
          'Invalid call to `DBOS.closeStream` outside of a workflow or step',
        );
      }
    } else {
      throw new DBOSInvalidWorkflowTransitionError('Invalid call to `DBOS.closeStream` outside of a workflow');
    }
  }

  /**
   * Read values from a stream as an async generator.
   * This function reads values from a stream identified by the workflowID and key,
   * yielding each value in order until the stream is closed or the workflow terminates.
   * @param workflowID - The workflow instance ID that owns the stream
   * @param key - The stream key/name within the workflow
   * @returns An async generator that yields each value in the stream until the stream is closed
   */
  static async *readStream<T>(workflowID: string, key: string): AsyncGenerator<T, void, unknown> {
    ensureDBOSIsLaunched('readStream');
    let offset = 0;

    while (true) {
      try {
        const value = await DBOSExecutor.globalInstance!.systemDatabase.readStream(workflowID, key, offset);
        if (value === DBOS_STREAM_CLOSED_SENTINEL) {
          break;
        }
        yield value as T;
        offset += 1;
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('No value found')) {
          // Poll the offset until a value arrives or the workflow terminates
          const status = await DBOS.getWorkflowStatus(workflowID);
          if (!status || !isWorkflowActive(status.status)) {
            break;
          }
          await sleepms(1000); // 1 second polling interval
          continue;
        }
        throw error;
      }
    }
  }


    @dbRetry()
  async writeStreamFromStep(workflowID: string, key: string, value: unknown): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');

      // Find the maximum offset for this workflow_uuid and key combination
      const maxOffsetResult = await client.query(
        `SELECT MAX("offset") FROM "${this.schemaName}".streams 
         WHERE workflow_uuid = $1 AND key = $2`,
        [workflowID, key],
      );

      // Next offset is max + 1, or 0 if no records exist
      const maxOffset = (maxOffsetResult.rows[0] as { max: number | null }).max;
      const nextOffset = maxOffset !== null ? maxOffset + 1 : 0;

      // Serialize the value before storing
      const serializedValue = JSON.stringify(value);

      // Insert the new stream entry
      await client.query(
        `INSERT INTO "${this.schemaName}".streams (workflow_uuid, key, value, "offset")
         VALUES ($1, $2, $3, $4)`,
        [workflowID, key, serializedValue, nextOffset],
      );

      await client.query('COMMIT');
    } catch (e) {
      this.logger.error(e);
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  @dbRetry()
  async writeStreamFromWorkflow(workflowID: string, functionID: number, key: string, value: unknown): Promise<void> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');

      const functionName =
        value === DBOS_STREAM_CLOSED_SENTINEL ? DBOS_FUNCNAME_CLOSESTREAM : DBOS_FUNCNAME_WRITESTREAM;

      await this.#runAndRecordResult(client, functionName, workflowID, functionID, async () => {
        // Find the maximum offset for this workflow_uuid and key combination
        const maxOffsetResult = await client.query(
          `SELECT MAX("offset") FROM "${this.schemaName}".streams 
           WHERE workflow_uuid = $1 AND key = $2`,
          [workflowID, key],
        );

        // Next offset is max + 1, or 0 if no records exist
        const maxOffset = (maxOffsetResult.rows[0] as { max: number | null }).max;
        const nextOffset = maxOffset !== null ? maxOffset + 1 : 0;

        // Serialize the value before storing
        const serializedValue = JSON.stringify(value);

        // Insert the new stream entry
        await client.query(
          `INSERT INTO "${this.schemaName}".streams (workflow_uuid, key, value, "offset")
           VALUES ($1, $2, $3, $4)`,
          [workflowID, key, serializedValue, nextOffset],
        );

        return undefined;
      });

      await client.query('COMMIT');
    } catch (e) {
      this.logger.error(e);
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async closeStream(workflowID: string, functionID: number, key: string): Promise<void> {
    await this.writeStreamFromWorkflow(workflowID, functionID, key, DBOS_STREAM_CLOSED_SENTINEL);
  }

  @dbRetry()
  async readStream(workflowID: string, key: string, offset: number): Promise<unknown> {
    const client: PoolClient = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT value FROM "${this.schemaName}".streams 
         WHERE workflow_uuid = $1 AND key = $2 AND "offset" = $3`,
        [workflowID, key, offset],
      );

      if (result.rows.length === 0) {
        throw new Error(`No value found for workflow_uuid=${workflowID}, key=${key}, offset=${offset}`);
      }

      // Deserialize the value before returning
      const row = result.rows[0] as { value: string };
      return JSON.parse(row.value);
    } finally {
      client.release();
    }
  }


  export interface streams {
  workflow_uuid: string;
  key: string;
  value: string;
  offset: number;
}