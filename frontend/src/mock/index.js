import { mock } from './MockAdapter'
import './fakeApi/commonFakeApi'

mock.onAny().passThrough()
