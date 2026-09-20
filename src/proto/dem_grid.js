// Generated from proto/dem_grid.proto.
import protobuf from 'protobufjs/light'

const root = protobuf.Root.fromJSON({
  nested: {
    moganshan: {
      nested: {
        dem: {
          nested: {
            DemGridCenter: { fields: { longitude: { type: 'double', id: 1 }, latitude: { type: 'double', id: 2 }, height: { type: 'double', id: 3 } } },
            DemGridCell: { fields: { code: { type: 'string', id: 1 }, center: { type: 'DemGridCenter', id: 2 }, maxLon: { type: 'double', id: 3 }, minLon: { type: 'double', id: 4 }, maxLat: { type: 'double', id: 5 }, minLat: { type: 'double', id: 6 }, top: { type: 'double', id: 7 }, bottom: { type: 'double', id: 8 } } },
            Pagination: { fields: { pageSize: { type: 'uint32', id: 1 }, hasMore: { type: 'bool', id: 2 }, nextCursor: { type: 'string', id: 3 } } },
            DemGridByBoundsResponse: { fields: { cells: { rule: 'repeated', type: 'DemGridCell', id: 1 }, count: { type: 'uint32', id: 2 }, pagination: { type: 'Pagination', id: 3 } } },
          },
        },
      },
    },
  },
})

export const DemGridByBoundsResponse = root.lookupType('moganshan.dem.DemGridByBoundsResponse')
