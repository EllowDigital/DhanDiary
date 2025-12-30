const makeResult = () => ({ rows: { length: 0, item: (_: number) => null } });

function openDatabase() {
  return {
    transaction: (cb: any) => {
      const tx = {
        executeSql: (sql: string, params: any[] = [], ok?: any, err?: any) => {
          try {
            const res = makeResult();
            if (ok) ok(tx, res);
            return true;
          } catch (e) {
            if (err) err(tx, e);
            return false;
          }
        },
      };
      try {
        cb(tx);
      } catch (e) {
        // noop
      }
      return tx;
    },
  };
}

function openDatabaseSync() {
  return openDatabase();
}

export { openDatabase, openDatabaseSync };

export default { openDatabase, openDatabaseSync };
