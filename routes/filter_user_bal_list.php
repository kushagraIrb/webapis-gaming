<?php
   if (! $this->session->userdata('logged_in')==TRUE){redirect('superadmin/login');}


$max = $this->input->get('max');
$min = $this->input->get('min');
$by_user = $this->input->get('by_user');
$Ddate = $this->input->get('ddate');
$Todate = $this->input->get('to_date');
$Fromdate = $this->input->get('from_date');
$datetyp = $this->input->get('day_type'); 

$this->db->select('first_name,last_name,phone,email,id')->from('tbl_registration');
if(!empty($by_user)){
    $this->db->where('id', $by_user);
}
if($datetyp==2 && !empty($Fromdate) && !empty($Todate)){
    $this->db->where('DATE(modified) >=', date('Y-m-d',strtotime($Fromdate)));
    $this->db->where('DATE(modified) <=', date('Y-m-d',strtotime($Todate)));
}
if($datetyp==1 && !empty($Ddate)){
    $this->db->where('DATE(modified) =', date('Y-m-d',strtotime($Ddate)));
}

$this->db->order_by('id','DESC');

$ac_list = $this->db->get()->result();
//echo $this->db->last_query(); die(); 
 ?>
<!DOCTYPE html>
<html lang="en" data-layout="vertical" data-topbar="light" data-sidebar="dark" data-sidebar-size="lg">
   <head>
      <meta charset="utf-8" />
      <title><?=ADMIN_NAME;?> | <?=$page_title;?> </title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta content="Premium Multipurpose Admin & Dashboard Template" name="description" />
      <meta content="Themesbrand" name="author" />
      <!-- App favicon -->
      <link rel="shortcut icon" href="<?=base_url("assets/superadmin/images/favicon.ico");?>">
      <!-- jsvectormap css -->
      <link href="<?=base_url("assets/superadmin/libs/jsvectormap/css/jsvectormap.min.css");?>" rel="stylesheet" type="text/css" />
      <!--Swiper slider css-->
      <link href="<?=base_url("assets/superadmin/libs/swiper/swiper-bundle.min.css");?>" rel="stylesheet" type="text/css" />
      <script src="<?=base_url("assets/superadmin/js/layout.js");?>"></script>
      <!-- Bootstrap Css -->
      <link href="<?=base_url("assets/superadmin/css/bootstrap.min.css");?>" rel="stylesheet" type="text/css" />
      <!-- Icons Css -->
      <link href="<?=base_url("assets/superadmin/css/icons.min.css");?>" rel="stylesheet" type="text/css" />
      <!-- App Css-->
      <link href="<?=base_url("assets/superadmin/css/app.min.css");?>" rel="stylesheet" type="text/css" />
      <!-- custom Css-->
      <link href="<?=base_url("assets/superadmin/css/custom.min.css");?>" rel="stylesheet" type="text/css" />
      <link href="https://cdn.datatables.net/1.12.1/css/jquery.dataTables.min.css" rel="stylesheet" type="text/css" />
	  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/selectize.js/0.12.6/css/selectize.bootstrap3.min.css"/>
      <style>
         .modal-header{border-bottom: 1px solid #e9ebec !important;}
         .modal-footer{border-top:1px solid #e9ebec !important;}
      </style>
   </head>
   <body>
      <!-- Begin page -->
      <div id="layout-wrapper">
         <?php include('header.php');?>
         <!-- ========== App Menu ========== -->
         <?php include('left_sidebar.php');?>
         <!-- Left Sidebar End -->
         <!-- Vertical Overlay-->
         <div class="vertical-overlay"></div>
         <!-- ============================================================== -->
         <!-- Start right Content here -->
         <!-- ============================================================== -->
         <div class="main-content">
            <div class="page-content">
               <div class="container-fluid">
                  <!-- start page title -->
                  <div class="row">
                     <div class="col-12">
                        <div class="page-title-box d-sm-flex align-items-center justify-content-between">
                           <h4 class="mb-sm-0"><?=$page_title;?></h4>
                           <div class="page-title-right">
                              <ol class="breadcrumb m-0">
                                 <li class="breadcrumb-item"><a href="<?=base_url('superadmin/admin/user_bal_list');?>">Manage User Balance</a></li>
                                 <li class="breadcrumb-item active"><?=$page_title;?></li>
                              </ol>
                           </div>
                        </div>
                     </div>
                  </div>
                  <!-- end page title -->
                  <div class="row">
                     <div class="col-xxl-12">
                        <div class="card">
                           <div class="card-header align-items-center d-flex">
                              <h4 class="card-title mb-0 flex-grow-1">USER BALANCE INFORMATION</h4>
                           </div>
                           <!-- end card header -->
                           <div class="card-body">
                              <!-- Success Alert -->
                              <?=$this->session->tempdata('flashData');?>
                              <!-- End Alert -->
							  <!-- Start filter -->
                              <form method="get" action="<?=base_url('superadmin/admin/filter');?>" autocomplete="off">
                                 <div class="card-body">
                                    <div class="form-group">
                                       <div class="row">
                                          <div class="col-md-3">
                                             <?php $this->load->view('superadmin/user_dropdown'); ?>
                                          </div>
										  <div class="col-md-3">
                                             <label for="authorshortbio"><b>Min Amount <span style="color: red;">*</span></b></label>
                                             <select class="form-select" name="min" required>
                                                <option value="">Select Min Value</option>
                                                <option value="0" <?php if(isset($min)){ if($min=='0'){echo "selected";} }?>>0</option>
                                                <option value="1000" <?php if(isset($min)){ if($min=='1000'){echo "selected";} }?>>1000</option>
												<option value="5000" <?php if(isset($min)){ if($min=='5000'){echo "selected";} }?>>5000</option>
												<option value="10000" <?php if(isset($min)){ if($min=='10000'){echo "selected";} }?>>10000</option>
												<option value="15000" <?php if(isset($min)){ if($min=='15000'){echo "selected";} }?>>15000</option>
												<option value="20000" <?php if(isset($min)){ if($min=='20000'){echo "selected";} }?>>20000</option>
                                                <option value="25000" <?php if(isset($min)){ if($min=='25000'){echo "selected";} }?>>25000</option>
												<option value="50000" <?php if(isset($min)){ if($min=='50000'){echo "selected";} }?>>50000</option>
												<option value="100000" <?php if(isset($min)){ if($min=='100000'){echo "selected";} }?>>100000</option>
												<option value="150000" <?php if(isset($min)){ if($min=='150000'){echo "selected";} }?>>150000</option>
												<option value="200000" <?php if(isset($min)){ if($min=='200000'){echo "selected";} }?>>200000</option>
												<option value="250000" <?php if(isset($min)){ if($min=='250000'){echo "selected";} }?>>250000</option>
                                             </select>
                                          </div>
										  <div class="col-md-3">
                                             <label for="authorshortbio"><b>Max Amount <span style="color: red;">*</span></b></label>
                                             <select class="form-select" name="max" required>
                                                <option value="">Select Max Value</option>
                                                <option value="1000" <?php if(isset($max)){ if($max=='1000'){echo "selected";} }?>>1000</option>
                                                <option value="5000" <?php if(isset($max)){ if($max=='5000'){echo "selected";} }?>>5000</option>
												<option value="10000" <?php if(isset($max)){ if($max=='10000'){echo "selected";} }?>>10000</option>
												<option value="15000" <?php if(isset($max)){ if($max=='15000'){echo "selected";} }?>>15000</option>
												<option value="20000" <?php if(isset($max)){ if($max=='20000'){echo "selected";} }?>>20000</option>
												<option value="25000" <?php if(isset($max)){ if($max=='25000'){echo "selected";} }?>>25000</option>
                                                <option value="50000" <?php if(isset($max)){ if($max=='50000'){echo "selected";} }?>>50000</option>
												<option value="100000" <?php if(isset($max)){ if($max=='100000'){echo "selected";} }?>>100000</option>
												<option value="150000" <?php if(isset($max)){ if($max=='150000'){echo "selected";} }?>>150000</option>
												<option value="200000" <?php if(isset($max)){ if($max=='200000'){echo "selected";} }?>>200000</option>
												<option value="250000" <?php if(isset($max)){ if($max=='250000'){echo "selected";} }?>>250000</option>
												<option value="-2" <?php if(isset($max)){ if($max=='-2'){echo "selected";} }?>>Above</option>
                                             </select>
                                          </div>
                                          <div class="col-md-3">
                                             <label for="authorshortbio"><b>Day Type <span style="color: red;">*</span></b></label>
                                             <select class="form-select" name="day_type" id="day_type">
                                                <option value="">Select Day Type</option>
                                                <option value="1" <?php if(isset($datetyp)){ if($datetyp==1){echo "selected";} }?>>One Day</option>
                                                        <option value="2" <?php if(isset($datetyp)){ if($datetyp==2){echo "selected";} }?>>Multiple Day</option>
                                             </select>
                                          </div>
												<div class="col-md-3" id="ddate" style="display:<?=($datetyp==1)?'block':'none';?>"> 
                                                    <label for="authorinput">Date <span style="color: red;">*</span></label>
                                                    <input type="date" name="ddate" id="d_date" value="<?=isset($Ddate)? $Ddate:'';?>" class="form-control">
                                                </div>
                                                <div class="col-md-3" id="fromDate" style="display:<?=($datetyp==2)?'block':'none';?>">
                                                    <label for="authorinput">From Date <span style="color: red;">*</span></label>
                                                    <input type="date" name="from_date" id="from_date" value="<?=isset($Fromdate)? $Fromdate:'';?>"  class="form-control">
                                                </div>
                                                <div class="col-md-3" id="toDate" style="display:<?=($datetyp==2)?'block':'none';?>">
                                                    <label for="authorinput">To Date <span style="color: red;">*</span></label>
                                                    <input type="date" name="to_date" id="to_date" value="<?=isset($Todate)? $Todate:'';?>"  class="form-control">
                                                </div>	
                                                <!--end col-->
                                       </div>
                                    </div>
                                    <div class="row">
                                       <div class="col-sm-3">
                                          <div class="form-group">
                                             <p>&nbsp;</p>
                                             <button type="submit" name="Search" class="btn btn-primary">Search</button>
                                             <a href="<?=base_url('superadmin/admin/user_bal_list');?>" name="Reset" id="ResetBtn" class="btn btn-danger">Reset</a>
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                              </form>
                              <!-- End filter -->
							    <div class="table-responsive table-card mt-3 mb-1">
                                 <!-- Hoverable Rows -->
                                 <table id="example" class="table table-hover table-striped table-nowrap mb-0">
                                    <thead>
                                       <tr>
                                          <th scope="col">SL.No</th>
                                          <th scope="col">User Name</th>
                                           <th scope="col">Phone</th>
                                          <th scope="col">Email</th>
                                          <th scope="col">Total Balance</th>
                                          <!--<th scope="col">Action</th>-->
                                       </tr>
                                    </thead>
                                    <tbody>
                                        <?php 
                                        $i=1;
                                        foreach($ac_list as $indx){
                                           $userbal = $this->common_model->WalletAmountByUID($indx->id);
                                           if($max!='-2'){
                                               $searchData = $userbal >= $min && $userbal <= $max;
                                           }else{
                                               $searchData = $userbal >= $min;
                                           }
										   if($userbal!='0.00'){
												if($searchData){
                                        ?>
                                       <tr>
                                          <th><?=$i;?></th>
                                          <td><?=ucfirst($indx->first_name);?> <?=ucfirst($indx->last_name);?></td>
                                          <td><?=mask_phone($indx->phone);?></td>
                                          <td><?=$indx->email;?></td>
                                          <td><?=($userbal) ? $userbal:'0.00';?></td>
                                         </tr>
                                       <?php 
											$i++;}}
									   }?>
                                    </tbody>
                                 </table>
                              </div>
                              
                           </div>
                        </div>
                     </div>
                     <!-- end col -->
                  </div>
                  <!--end row-->
               </div>
               <!-- container-fluid -->
            </div>
            <!-- End Page-content -->
            <?php include('footer.php');?>
         </div>
         <!-- end main content-->
      </div>
      <!-- END layout-wrapper -->
      <!--start back-to-top-->
      <button onclick="topFunction()" class="btn btn-danger btn-icon" id="back-to-top">
      <i class="ri-arrow-up-line"></i>
      </button>
      <!-- JAVASCRIPT -->
      <script src="<?=base_url("assets/superadmin/libs/bootstrap/js/bootstrap.bundle.min.js");?>"></script>
      <script src="<?=base_url("assets/superadmin/libs/simplebar/simplebar.min.js");?>"></script>
      <script src="<?=base_url("assets/superadmin/libs/node-waves/waves.min.js");?>"></script>
      <script src="<?=base_url("assets/superadmin/libs/feather-icons/feather.min.js");?>"></script>
      <script src="<?=base_url("assets/superadmin/js/pages/plugins/lord-icon-2.1.0.js");?>"></script>
      <script src="<?=base_url("assets/superadmin/js/plugins.js");?>"></script>
      <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
      <script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js"></script>
      <!-- App js -->
      <script src="<?=base_url("assets/libs/prismjs/prism.js");?>"></script>
      <script src="<?=base_url("assets/libs/list.pagination.js/list.pagination.min.js");?>"></script>
      <script src="<?=base_url("assets/libs/sweetalert2/sweetalert2.min.js");?>"></script>
      <script src="<?=base_url("assets/superadmin/js/app.js");?>"></script>
      <script src="https://cdn.datatables.net/1.12.1/js/jquery.dataTables.min.js"></script>
	  <script src="https://cdnjs.cloudflare.com/ajax/libs/selectize.js/0.12.6/js/standalone/selectize.min.js" crossorigin="anonymous"></script>
      <script>
        $(document).ready(function () {
              $('.form-selector').selectize({
                  sortField: 'text'
              });
          });
</script>
	  <script>
         $(document).ready(function () {
          $('#example').DataTable();
         });
         
         /*======Display Referral Bonus Amount =======*/
         $(document).ready(function(){
         $(".ReferralBonus").click(function(){
         var uid = $(this).data('uid');
         $.ajax({
         url:'<?=base_url()?>superadmin/users/referralBonus',
         method: 'post',
         data: {'uid': uid},
         success: function (data){
             //alert(data); return false;
          if(data!=''){
              //var str = data.split("|");
            	  $('#myModal').modal('show');
            	  $("#TableData").html(data);
            	  //$("#UserName").text(str[0]);
            	  //$("#UserBal").text(str[1]);
          }
         }
         });
         });
         });
		 
		 $("#day_type").change(function() {
  var day_type = $('#day_type').val();
  if(day_type==1){
    $("#ddate").css("display", "block");
    $('#d_date').attr('required', true);
    $("#fromDate").css("display", "none");
    $("#toDate").css("display", "none");
    $('#from_date').attr('required', false);
    $('#to_date').attr('required', false);
  }
  else{
    $("#ddate").css("display", "none");
    $("#fromDate").css("display", "block");
    $('#from_date').attr('required', true);
    $("#toDate").css("display", "block");
    $('#to_date').attr('required', true);
    $('#d_date').attr('required', false);
  }
});
      </script>
   </body>
</html>