from nomad_sdk.workflow import NodeAttributes, NodeAttributesUniverse, NomadWorkflow

nodes = NodeAttributesUniverse(
    nodes={
        0: NodeAttributes(
            name='Geometry optimization',
            type='workflow',
            entry_type='simulation',
            path_info={'mainfile_path': 'Emin/mdrun_Emin.log'},
        ),
        1: NodeAttributes(
            name='Production MD',
            type='workflow',
            entry_type='simulation',
            path_info={'mainfile_path': 'Prod_NVT/mdrun_Prod-NVT.log'},
            in_edge_nodes=[0],
        ),
    }
)

NomadWorkflow(
    node_attributes_universe=nodes,
    name='Two-step MD',
    destination_filename='workflow.archive.yaml',
).build_workflow_yaml()
