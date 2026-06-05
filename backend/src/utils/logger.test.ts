import { logger, morganStream } from './logger';

describe('logger', () => {
  it('morganStream.write utilise logger.info avec trim', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    morganStream.write('GET /health 200\n');

    expect(spy).toHaveBeenCalledWith('GET /health 200');
    spy.mockRestore();
  });
});
